import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const OUTPUT_ROOT = "data";
const RAW_DIR = join(OUTPUT_ROOT, "raw");
const PROCESSED_DIR = join(OUTPUT_ROOT, "processed");

const RESOURCE_KEY = "948aa3aa-1c05-4cc3-b68c-6dd65a53c694";
const MODEL_ID = 11730893;
const API_ROOT = "https://wabi-south-central-us-api.analysis.windows.net/public/reports";

function makeHeaders() {
  return {
    Accept: "application/json",
    ActivityId: randomUUID(),
    RequestId: randomUUID(),
    "Content-Type": "application/json",
    "X-PowerBI-ResourceKey": RESOURCE_KEY
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function fetchModelsAndExploration() {
  return fetchJson(
    `${API_ROOT}/${RESOURCE_KEY}/modelsAndExploration?preferReadOnlySession=true`,
    { headers: makeHeaders() }
  );
}

async function fetchConceptualSchema() {
  return fetchJson(`${API_ROOT}/${RESOURCE_KEY}/conceptualschema`, {
    headers: makeHeaders()
  });
}

function buildColumn(source, property, name) {
  return {
    Column: {
      Expression: {
        SourceRef: { Source: source }
      },
      Property: property
    },
    Name: name
  };
}

function buildAggregation(source, property, fn, name) {
  return {
    Aggregation: {
      Expression: {
        Column: {
          Expression: {
            SourceRef: { Source: source }
          },
          Property: property
        }
      },
      Function: fn
    },
    Name: name
  };
}

function buildDateEqualsCondition(source, property, isoDate) {
  return {
    Condition: {
      Comparison: {
        ComparisonKind: 0,
        Left: {
          Column: {
            Expression: {
              SourceRef: { Source: source }
            },
            Property: property
          }
        },
        Right: {
          Literal: {
            Value: `datetime'${isoDate}T00:00:00'`
          }
        }
      }
    }
  };
}

async function queryData({ from, select, where = [], projections, top = 500 }) {
  const body = {
    version: "1.0.0",
    queries: [
      {
        Query: {
          Commands: [
            {
              SemanticQueryDataShapeCommand: {
                Query: {
                  Version: 2,
                  From: from,
                  Select: select,
                  ...(where.length > 0 ? { Where: where } : {})
                },
                Binding: {
                  Primary: {
                    Groupings: [
                      {
                        Projections: projections
                      }
                    ]
                  },
                  DataReduction: {
                    DataVolume: 3,
                    Primary: {
                      Top: {
                        Count: top
                      }
                    }
                  },
                  Version: 1
                },
                ExecutionMetricsKind: 1
              }
            }
          ]
        }
      }
    ],
    modelId: MODEL_ID
  };

  return fetchJson(`${API_ROOT}/querydata?synchronous=true`, {
    method: "POST",
    headers: makeHeaders(),
    body: JSON.stringify(body)
  });
}

function decodeValue(raw, schemaEntry, valueDicts) {
  if (raw == null) {
    return null;
  }

  if (schemaEntry?.DN) {
    return valueDicts?.[schemaEntry.DN]?.[raw] ?? raw;
  }

  if (schemaEntry?.T === 7) {
    return new Date(raw).toISOString().slice(0, 10);
  }

  if (schemaEntry?.T === 3 || schemaEntry?.T === 4) {
    return typeof raw === "number" ? raw : Number(raw);
  }

  return fixMojibake(raw);
}

function fixMojibake(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (!/[ÃÂ]/.test(value)) {
    return value;
  }

  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
}

function parseDsrRows(queryResult) {
  const ds = queryResult.results[0]?.result?.data?.dsr?.DS?.[0];
  const rowSet = ds?.PH?.[0]?.DM0 ?? [];

  if (rowSet.length === 0) {
    return [];
  }

  const schema = rowSet[0].S;
  const valueDicts = ds.ValueDicts ?? {};
  const rows = [];
  let previous = new Array(schema.length).fill(null);

  for (const entry of rowSet) {
    const current = [];

    if (!("C" in entry)) {
      for (let index = 0; index < schema.length; index += 1) {
        const schemaEntry = schema[index];
        current.push(decodeValue(entry[schemaEntry.N], schemaEntry, valueDicts));
      }
    } else {
      const compressed = entry.C ?? [];
      const repeatMask = entry.R ?? 0;
      let cursor = 0;

      for (let index = 0; index < schema.length; index += 1) {
        const shouldRepeat = (repeatMask & (1 << index)) !== 0;
        const value = shouldRepeat ? previous[index] : compressed[cursor++];
        current.push(decodeValue(value, schema[index], valueDicts));
      }
    }

    rows.push(current);
    previous = current;
  }

  return rows;
}

function rowsToObjects(rows, keys) {
  return rows.map((row) =>
    Object.fromEntries(keys.map((key, index) => [key, row[index] ?? null]))
  );
}

async function getLatestDate() {
  const payload = await queryData({
    from: [{ Name: "h", Entity: "Fechas", Type: 0 }],
    select: [buildAggregation("h", "Fecha", 4, "Max(Fechas.Fecha)")],
    projections: [0],
    top: 1
  });

  return parseDsrRows(payload)[0][0];
}

async function getRoutes() {
  const payload = await queryData({
    from: [{ Name: "b", Entity: "BaseRutas", Type: 0 }],
    select: [
      buildColumn("b", "Ruta", "BaseRutas.Ruta"),
      buildColumn("b", "Origen", "BaseRutas.Origen"),
      buildColumn("b", "Destino", "BaseRutas.Destino"),
      buildColumn("b", "Gasoducto", "BaseRutas.Gasoducto"),
      buildColumn("b", "Latitud Origen", "BaseRutas.Latitud Origen"),
      buildColumn("b", "Longitud Origen", "BaseRutas.Longitud Origen"),
      buildColumn("b", "Latitud Destino", "BaseRutas.Latitud Destino"),
      buildColumn("b", "Longitud Destino", "BaseRutas.Longitud Destino")
    ],
    projections: [0, 1, 2, 3, 4, 5, 6, 7],
    top: 100
  });

  return rowsToObjects(parseDsrRows(payload), [
    "ruta",
    "origen",
    "destino",
    "gasoducto",
    "latitudOrigen",
    "longitudOrigen",
    "latitudDestino",
    "longitudDestino"
  ]);
}

async function getLatestFlows(latestDate) {
  const payload = await queryData({
    from: [{ Name: "f", Entity: "Flujos", Type: 0 }],
    select: [
      buildColumn("f", "Ruta", "Flujos.Ruta"),
      buildColumn("f", "Caudal", "Flujos.Caudal"),
      buildColumn("f", "F-CF", "Flujos.F-CF"),
      buildColumn("f", "Flujo-ContrFlujo", "Flujos.Flujo-ContrFlujo")
    ],
    where: [buildDateEqualsCondition("f", "Fecha", latestDate)],
    projections: [0, 1, 2, 3],
    top: 200
  });

  return rowsToObjects(parseDsrRows(payload), [
    "ruta",
    "caudal",
    "fcf",
    "sentido"
  ]);
}

async function getLatestCapacity(latestDate) {
  const payload = await queryData({
    from: [{ Name: "c", Entity: "Capacidad", Type: 0 }],
    select: [
      buildColumn("c", "Ruta", "Capacidad.Ruta"),
      buildColumn("c", "Capacidad", "Capacidad.Capacidad")
    ],
    where: [buildDateEqualsCondition("c", "Fecha", latestDate)],
    projections: [0, 1],
    top: 200
  });

  return rowsToObjects(parseDsrRows(payload), ["ruta", "capacidad"]);
}

function buildMetadata(modelsAndExploration, conceptualSchema, latestDate) {
  const model = modelsAndExploration.models[0];
  const exploration = modelsAndExploration.exploration;
  const entities =
    conceptualSchema.schemas[0]?.schema?.Entities?.map((entity) => ({
      name: entity.Name,
      columns: entity.Properties.map((property) => property.Name)
    })) ?? [];

  return {
    generatedAt: new Date().toISOString(),
    source: "ENARGAS Power BI public report",
    resourceKey: RESOURCE_KEY,
    model: {
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      lastRefreshTime: model.LastRefreshTime
    },
    latestDate,
    visuals: exploration.sections[0].visualContainers.map((visual) => {
      const config = JSON.parse(visual.config);
      return {
        id: visual.id,
        visualType: config.singleVisual?.visualType ?? "n/a"
      };
    }),
    entities
  };
}

function buildLatestSnapshot({ latestDate, routes, flows, capacity }) {
  const flowsByRoute = new Map(flows.map((item) => [item.ruta, item]));
  const capacityByRoute = new Map(capacity.map((item) => [item.ruta, item]));

  const routesWithMetrics = routes.map((route) => {
    const flow = flowsByRoute.get(route.ruta) ?? {};
    const cap = capacityByRoute.get(route.ruta) ?? {};
    const caudal = flow.caudal ?? null;
    const capacidad = cap.capacidad ?? null;
    const utilization =
      caudal != null && capacidad != null && capacidad !== 0
        ? caudal / capacidad
        : null;

    return {
      ...route,
      fecha: latestDate,
      caudal,
      capacidad,
      fcf: flow.fcf ?? null,
      sentido: flow.sentido ?? null,
      utilization
    };
  });

  const withFlow = routesWithMetrics.filter((item) => item.caudal != null);
  const withCapacity = routesWithMetrics.filter((item) => item.capacidad != null);

  return {
    generatedAt: new Date().toISOString(),
    source: "ENARGAS Power BI public report",
    latestDate,
    stats: {
      routes: routes.length,
      routesWithFlow: withFlow.length,
      routesWithCapacity: withCapacity.length,
      totalFlow: withFlow.reduce((sum, item) => sum + item.caudal, 0),
      totalCapacity: withCapacity.reduce((sum, item) => sum + item.capacidad, 0)
    },
    routes: routesWithMetrics
  };
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(PROCESSED_DIR, { recursive: true });

  console.log("Fetching Power BI report metadata...");
  const [modelsAndExploration, conceptualSchema] = await Promise.all([
    fetchModelsAndExploration(),
    fetchConceptualSchema()
  ]);

  console.log("Resolving latest date...");
  const latestDate = await getLatestDate();

  console.log(`Fetching route metadata for ${latestDate}...`);
  const [routes, flows, capacity] = await Promise.all([
    getRoutes(),
    getLatestFlows(latestDate),
    getLatestCapacity(latestDate)
  ]);

  const metadata = buildMetadata(modelsAndExploration, conceptualSchema, latestDate);
  const latestSnapshot = buildLatestSnapshot({
    latestDate,
    routes,
    flows,
    capacity
  });

  await Promise.all([
    writeFile(
      join(RAW_DIR, "powerbi-models-and-exploration.json"),
      JSON.stringify(modelsAndExploration, null, 2),
      "utf8"
    ),
    writeFile(
      join(RAW_DIR, "powerbi-conceptual-schema.json"),
      JSON.stringify(conceptualSchema, null, 2),
      "utf8"
    ),
    writeFile(
      join(PROCESSED_DIR, "powerbi-report-metadata.json"),
      JSON.stringify(metadata, null, 2),
      "utf8"
    ),
    writeFile(
      join(PROCESSED_DIR, "powerbi-flows-latest.json"),
      JSON.stringify(latestSnapshot, null, 2),
      "utf8"
    )
  ]);

  console.log("Done.");
  console.log(`Latest date: ${latestSnapshot.latestDate}`);
  console.log(`Routes: ${latestSnapshot.stats.routes}`);
  console.log(`Routes with flow: ${latestSnapshot.stats.routesWithFlow}`);
  console.log(`Routes with capacity: ${latestSnapshot.stats.routesWithCapacity}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
