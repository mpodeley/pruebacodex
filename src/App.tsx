import { useMemo, useState } from "react";
import flowData from "../data/processed/powerbi-flows-latest.json";

type RouteRecord = {
  ruta: string;
  origen: string;
  destino: string;
  gasoducto: string;
  latitudOrigen: number;
  longitudOrigen: number;
  latitudDestino: number;
  longitudDestino: number;
  fecha: string;
  caudal: number | null;
  capacidad: number | null;
  fcf: string | null;
  sentido: string | null;
  utilization: number | null;
};

type FlowDataset = {
  latestDate: string;
  stats: {
    routes: number;
    routesWithFlow: number;
    routesWithCapacity: number;
    totalFlow: number;
    totalCapacity: number;
  };
  routes: RouteRecord[];
};

type Node = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type Transform = {
  scale: number;
  x: number;
  y: number;
};

const dataset = flowData as FlowDataset;
const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 760;
const INITIAL_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };

function fixText(value: string | null) {
  if (!value) {
    return "";
  }

  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

function formatNumber(value: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "Sin dato";
  }

  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  }).format(value);
}

function utilizationColor(utilization: number | null) {
  if (utilization == null) {
    return "#9aa7b6";
  }
  if (utilization >= 1) {
    return "#d6472f";
  }
  if (utilization >= 0.8) {
    return "#f08c2e";
  }
  if (utilization >= 0.5) {
    return "#e2ba33";
  }
  return "#2f9d62";
}

function useDerivedNetwork(routes: RouteRecord[]) {
  return useMemo(() => {
    const cleanedRoutes = routes.map((route) => ({
      ...route,
      ruta: fixText(route.ruta),
      origen: fixText(route.origen),
      destino: fixText(route.destino),
      gasoducto: fixText(route.gasoducto),
      fcf: fixText(route.fcf),
      sentido: fixText(route.sentido)
    }));

    const bounds = cleanedRoutes.reduce(
      (acc, route) => ({
        minLat: Math.min(acc.minLat, route.latitudOrigen, route.latitudDestino),
        maxLat: Math.max(acc.maxLat, route.latitudOrigen, route.latitudDestino),
        minLon: Math.min(acc.minLon, route.longitudOrigen, route.longitudDestino),
        maxLon: Math.max(acc.maxLon, route.longitudOrigen, route.longitudDestino)
      }),
      {
        minLat: Infinity,
        maxLat: -Infinity,
        minLon: Infinity,
        maxLon: -Infinity
      }
    );

    const project = (lat: number, lon: number) => {
      const x =
        ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon || 1)) *
          (CANVAS_WIDTH - 180) +
        90;
      const y =
        CANVAS_HEIGHT -
        (((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat || 1)) *
          (CANVAS_HEIGHT - 180) +
          90);
      return { x, y };
    };

    const nodes = new Map<string, Node>();
    for (const route of cleanedRoutes) {
      if (!nodes.has(route.origen)) {
        const projected = project(route.latitudOrigen, route.longitudOrigen);
        nodes.set(route.origen, {
          id: route.origen,
          label: route.origen,
          ...projected
        });
      }
      if (!nodes.has(route.destino)) {
        const projected = project(route.latitudDestino, route.longitudDestino);
        nodes.set(route.destino, {
          id: route.destino,
          label: route.destino,
          ...projected
        });
      }
    }

    const maxCaudal = Math.max(
      ...cleanedRoutes.map((route) => route.caudal ?? 0),
      1
    );

    return {
      nodes: Array.from(nodes.values()),
      routes: cleanedRoutes.map((route) => {
        const start = nodes.get(route.origen)!;
        const end = nodes.get(route.destino)!;
        return {
          ...route,
          start,
          end,
          strokeWidth:
            1.5 + (((route.caudal ?? 0) / maxCaudal) * 10)
        };
      }),
      gasoductos: Array.from(new Set(cleanedRoutes.map((route) => route.gasoducto))).sort()
    };
  }, [routes]);
}

export default function App() {
  const [selectedGasoducto, setSelectedGasoducto] = useState("Todos");
  const [selectedRoute, setSelectedRoute] = useState<RouteRecord | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);

  const network = useDerivedNetwork(dataset.routes);

  const visibleRoutes = useMemo(() => {
    return network.routes.filter((route) => {
      const gasoductoMatch =
        selectedGasoducto === "Todos" || route.gasoducto === selectedGasoducto;
      const criticalMatch = !showCriticalOnly || (route.utilization ?? 0) >= 0.8;
      return gasoductoMatch && criticalMatch;
    });
  }, [network.routes, selectedGasoducto, showCriticalOnly]);

  const visibleNodes = useMemo(() => {
    const activeLabels = new Set<string>();
    for (const route of visibleRoutes) {
      activeLabels.add(route.origen);
      activeLabels.add(route.destino);
    }
    return network.nodes.filter((node) => activeLabels.has(node.label));
  }, [network.nodes, visibleRoutes]);

  const busiestRoutes = useMemo(
    () =>
      [...network.routes]
        .filter((route) => route.utilization != null)
        .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0))
        .slice(0, 6),
    [network.routes]
  );

  const selectedDetails =
    selectedRoute &&
    network.routes.find((route) => route.ruta === selectedRoute.ruta);

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    setTransform((current) => ({
      ...current,
      scale: Math.min(3.2, Math.max(0.7, current.scale * factor))
    }));
  }

  function panBy(x: number, y: number) {
    setTransform((current) => ({
      ...current,
      x: current.x + x,
      y: current.y + y
    }));
  }

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <header className="hero">
        <div>
          <p className="eyebrow">Argentina Gas Grid</p>
          <h1>Flujo vs capacidad sobre la red de transporte</h1>
          <p className="lede">
            Vista esquemática interactiva con datos públicos de ENARGAS y Power BI,
            lista para evolucionar a GitHub Pages.
          </p>
        </div>
        <div className="hero-metrics">
          <Metric label="Fecha de corte" value={dataset.latestDate} />
          <Metric label="Caudal total" value={`${formatNumber(dataset.stats.totalFlow)} MMm3/d`} />
          <Metric
            label="Capacidad total"
            value={`${formatNumber(dataset.stats.totalCapacity)} MMm3/d`}
          />
        </div>
      </header>

      <section className="control-bar">
        <label>
          <span>Gasoducto</span>
          <select
            value={selectedGasoducto}
            onChange={(event) => setSelectedGasoducto(event.target.value)}
          >
            <option>Todos</option>
            {network.gasoductos.map((gasoducto) => (
              <option key={gasoducto}>{gasoducto}</option>
            ))}
          </select>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={showCriticalOnly}
            onChange={(event) => setShowCriticalOnly(event.target.checked)}
          />
          <span>Mostrar solo tramos con uso mayor a 80%</span>
        </label>
        <div className="zoom-tools">
          <button type="button" onClick={() => setTransform(INITIAL_TRANSFORM)}>
            Reset
          </button>
          <button type="button" onClick={() => panBy(0, -40)}>
            Arriba
          </button>
          <button type="button" onClick={() => panBy(-40, 0)}>
            Izq
          </button>
          <button type="button" onClick={() => panBy(40, 0)}>
            Der
          </button>
          <button type="button" onClick={() => panBy(0, 40)}>
            Abajo
          </button>
        </div>
      </section>

      <main className="layout">
        <section className="map-panel">
          <div className="panel-heading">
            <div>
              <h2>Red esquemática</h2>
              <p>
                El grosor representa caudal y el color representa utilización.
              </p>
            </div>
            <Legend />
          </div>
          <svg
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            className="network-map"
            onWheel={handleWheel}
          >
            <g
              transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
            >
              <rect
                x="30"
                y="30"
                width={CANVAS_WIDTH - 60}
                height={CANVAS_HEIGHT - 60}
                rx="30"
                className="map-frame"
              />
              {visibleRoutes.map((route) => (
                <g
                  key={route.ruta}
                  onClick={() => setSelectedRoute(route)}
                  className="route-hit"
                >
                  <line
                    x1={route.start.x}
                    y1={route.start.y}
                    x2={route.end.x}
                    y2={route.end.y}
                    stroke={utilizationColor(route.utilization)}
                    strokeWidth={route.strokeWidth}
                    strokeLinecap="round"
                    opacity={selectedDetails && selectedDetails.ruta !== route.ruta ? 0.18 : 0.94}
                  />
                </g>
              ))}
              {visibleNodes.map((node) => (
                <g key={node.id}>
                  <circle cx={node.x} cy={node.y} r="5.5" className="node-dot" />
                  <text x={node.x + 8} y={node.y - 8} className="node-label">
                    {node.label}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </section>

        <aside className="side-panel">
          <section className="detail-card">
            <h3>Detalle del tramo</h3>
            {selectedDetails ? (
              <div className="detail-grid">
                <Detail label="Ruta" value={selectedDetails.ruta} />
                <Detail label="Gasoducto" value={selectedDetails.gasoducto} />
                <Detail label="Origen" value={selectedDetails.origen} />
                <Detail label="Destino" value={selectedDetails.destino} />
                <Detail
                  label="Caudal"
                  value={
                    selectedDetails.caudal == null
                      ? "Sin dato"
                      : `${formatNumber(selectedDetails.caudal)} MMm3/d`
                  }
                />
                <Detail
                  label="Capacidad"
                  value={
                    selectedDetails.capacidad == null
                      ? "Sin dato"
                      : `${formatNumber(selectedDetails.capacidad)} MMm3/d`
                  }
                />
                <Detail
                  label="Utilización"
                  value={
                    selectedDetails.utilization == null
                      ? "Sin dato"
                      : `${formatNumber(selectedDetails.utilization * 100)}%`
                  }
                />
                <Detail label="Sentido" value={selectedDetails.sentido || "Sin dato"} />
              </div>
            ) : (
              <p className="empty-copy">
                Elegí un tramo para ver sus métricas y el balance flujo/capacidad.
              </p>
            )}
          </section>

          <section className="detail-card">
            <h3>Tramos más exigidos</h3>
            <ul className="hot-list">
              {busiestRoutes.map((route) => (
                <li key={route.ruta}>
                  <button type="button" onClick={() => setSelectedRoute(route)}>
                    <span>{route.ruta}</span>
                    <strong>{formatNumber((route.utilization ?? 0) * 100)}%</strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <div><i style={{ background: "#2f9d62" }} /> Bajo</div>
      <div><i style={{ background: "#e2ba33" }} /> Medio</div>
      <div><i style={{ background: "#f08c2e" }} /> Alto</div>
      <div><i style={{ background: "#d6472f" }} /> Saturado</div>
    </div>
  );
}
