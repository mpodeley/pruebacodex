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

type NetworkRoute = RouteRecord & {
  start: Node;
  end: Node;
  strokeWidth: number;
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
const VIEWPORT_BOUNDS = {
  minLat: -56,
  maxLat: -20,
  minLon: -74,
  maxLon: -52
};
const ARGENTINA_POLYGON = [
  [-68.4, -21.8],
  [-66.3, -22.2],
  [-65.1, -24.2],
  [-66.2, -26.3],
  [-67.3, -28.6],
  [-68.2, -31.1],
  [-69.1, -33.6],
  [-70.1, -36.2],
  [-71.2, -38.8],
  [-71.5, -41.4],
  [-71.1, -43.8],
  [-70.2, -46.1],
  [-69.7, -48.2],
  [-68.5, -50.4],
  [-67.2, -52.1],
  [-66.1, -54.4],
  [-64.7, -54.9],
  [-64, -53.5],
  [-63.4, -51.7],
  [-62.8, -49.3],
  [-62.1, -46.7],
  [-61.5, -43.9],
  [-60.8, -40.7],
  [-60, -37.8],
  [-59.1, -35.5],
  [-58.3, -34.2],
  [-57.5, -32.6],
  [-56.6, -30.1],
  [-55.5, -27.4],
  [-54.8, -25.9],
  [-54.6, -24.3],
  [-55.7, -22.6],
  [-57.8, -21.7],
  [-60.7, -21.9],
  [-63.8, -22.4],
  [-66.3, -22.2]
] as const;

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
    return "#4b648b";
  }
  if (utilization >= 1) {
    return "#ff5f87";
  }
  if (utilization >= 0.8) {
    return "#ff9d4d";
  }
  if (utilization >= 0.5) {
    return "#ffe06d";
  }
  return "#53e0a1";
}

function projectPoint(lat: number, lon: number) {
  const x =
    ((lon - VIEWPORT_BOUNDS.minLon) /
      (VIEWPORT_BOUNDS.maxLon - VIEWPORT_BOUNDS.minLon || 1)) *
      (CANVAS_WIDTH - 180) +
    90;
  const y =
    CANVAS_HEIGHT -
    (((lat - VIEWPORT_BOUNDS.minLat) /
      (VIEWPORT_BOUNDS.maxLat - VIEWPORT_BOUNDS.minLat || 1)) *
      (CANVAS_HEIGHT - 180) +
      90);
  return { x, y };
}

function buildPolygonPath(points: readonly (readonly [number, number])[]) {
  return `${points
    .map(([lon, lat], index) => {
      const { x, y } = projectPoint(lat, lon);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ")} Z`;
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

    const nodes = new Map<string, Node>();

    for (const route of cleanedRoutes) {
      if (!nodes.has(route.origen)) {
        const projected = projectPoint(route.latitudOrigen, route.longitudOrigen);
        nodes.set(route.origen, {
          id: route.origen,
          label: route.origen,
          ...projected
        });
      }

      if (!nodes.has(route.destino)) {
        const projected = projectPoint(route.latitudDestino, route.longitudDestino);
        nodes.set(route.destino, {
          id: route.destino,
          label: route.destino,
          ...projected
        });
      }
    }

    const maxCaudal = Math.max(...cleanedRoutes.map((route) => route.caudal ?? 0), 1);

    const networkRoutes: NetworkRoute[] = cleanedRoutes.map((route) => {
      const start = nodes.get(route.origen)!;
      const end = nodes.get(route.destino)!;

      return {
        ...route,
        start,
        end,
        strokeWidth: 1.6 + ((route.caudal ?? 0) / maxCaudal) * 10
      };
    });

    return {
      nodes: Array.from(nodes.values()),
      routes: networkRoutes,
      argentinaPath: buildPolygonPath(ARGENTINA_POLYGON),
      gasoductos: Array.from(
        new Set(cleanedRoutes.map((route) => route.gasoducto))
      ).sort()
    };
  }, [routes]);
}

export default function App() {
  const [selectedGasoducto, setSelectedGasoducto] = useState("Todos");
  const [selectedRoute, setSelectedRoute] = useState<NetworkRoute | null>(null);
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
            Vista geo referenciada sobre una silueta de Argentina, con foco en
            caudal, saturacion y lectura rapida de la red.
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
              <h2>Red geo referenciada</h2>
              <p>El grosor representa caudal y el color representa utilizacion.</p>
            </div>
            <Legend />
          </div>
          <svg
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            className="network-map"
            onWheel={handleWheel}
          >
            <defs>
              <radialGradient id="nightGlow" cx="50%" cy="45%" r="70%">
                <stop offset="0%" stopColor="rgba(85,126,255,0.22)" />
                <stop offset="65%" stopColor="rgba(17,24,46,0.08)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="map-ocean" />
            <ellipse
              cx={CANVAS_WIDTH / 2}
              cy={CANVAS_HEIGHT / 2}
              rx={CANVAS_WIDTH * 0.38}
              ry={CANVAS_HEIGHT * 0.4}
              fill="url(#nightGlow)"
            />
            <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
              <path d={network.argentinaPath} className="country-fill" />
              <rect
                x="30"
                y="30"
                width={CANVAS_WIDTH - 60}
                height={CANVAS_HEIGHT - 60}
                rx="30"
                className="map-frame"
              />
              <path d={network.argentinaPath} className="country-outline" />
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
                    opacity={selectedDetails && selectedDetails.ruta !== route.ruta ? 0.14 : 0.9}
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
                  label="Utilizacion"
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
                Elegi un tramo para ver sus metricas y el balance flujo/capacidad.
              </p>
            )}
          </section>

          <section className="detail-card">
            <h3>Tramos mas exigidos</h3>
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
      <div><i style={{ background: "#53e0a1" }} /> Bajo</div>
      <div><i style={{ background: "#ffe06d" }} /> Medio</div>
      <div><i style={{ background: "#ff9d4d" }} /> Alto</div>
      <div><i style={{ background: "#ff5f87" }} /> Saturado</div>
    </div>
  );
}
