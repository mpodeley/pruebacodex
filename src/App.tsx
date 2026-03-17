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
  minLat: -55.6,
  maxLat: -21.2,
  minLon: -73.6,
  maxLon: -53.4
};
const ARGENTINA_POLYGON = [
  [-64.964892, -22.075862],
  [-64.377021, -22.798091],
  [-63.986838, -21.993644],
  [-62.846468, -22.034985],
  [-62.685057, -22.249029],
  [-60.846565, -23.880713],
  [-60.028966, -24.032796],
  [-58.807128, -24.771459],
  [-57.777217, -25.16234],
  [-57.63366, -25.603657],
  [-58.618174, -27.123719],
  [-57.60976, -27.395899],
  [-56.486702, -27.548499],
  [-55.695846, -27.387837],
  [-54.788795, -26.621786],
  [-54.625291, -25.739255],
  [-54.13005, -25.547639],
  [-53.628349, -26.124865],
  [-53.648735, -26.923473],
  [-54.490725, -27.474757],
  [-55.162286, -27.881915],
  [-56.2909, -28.852761],
  [-57.625133, -30.216295],
  [-57.874937, -31.016556],
  [-58.14244, -32.044504],
  [-58.132648, -33.040567],
  [-58.349611, -33.263189],
  [-58.427074, -33.909454],
  [-58.495442, -34.43149],
  [-57.22583, -35.288027],
  [-57.362359, -35.97739],
  [-56.737487, -36.413126],
  [-56.788285, -36.901572],
  [-57.749157, -38.183871],
  [-59.231857, -38.72022],
  [-61.237445, -38.928425],
  [-62.335957, -38.827707],
  [-62.125763, -39.424105],
  [-62.330531, -40.172586],
  [-62.145994, -40.676897],
  [-62.745803, -41.028761],
  [-63.770495, -41.166789],
  [-64.73209, -40.802677],
  [-65.118035, -41.064315],
  [-64.978561, -42.058001],
  [-64.303408, -42.359016],
  [-63.755948, -42.043687],
  [-63.458059, -42.563138],
  [-64.378804, -42.873558],
  [-65.181804, -43.495381],
  [-65.328823, -44.501366],
  [-65.565269, -45.036786],
  [-66.509966, -45.039628],
  [-67.293794, -45.551896],
  [-67.580546, -46.301773],
  [-66.597066, -47.033925],
  [-65.641027, -47.236135],
  [-65.985088, -48.133289],
  [-67.166179, -48.697337],
  [-67.816088, -49.869669],
  [-68.728745, -50.264218],
  [-69.138539, -50.73251],
  [-68.815561, -51.771104],
  [-68.149995, -52.349983],
  [-68.571545, -52.299444],
  [-69.498362, -52.142761],
  [-71.914804, -52.009022],
  [-72.329404, -51.425956],
  [-72.309974, -50.67701],
  [-72.975747, -50.74145],
  [-73.328051, -50.378785],
  [-73.415436, -49.318436],
  [-72.648247, -48.878618],
  [-72.331161, -48.244238],
  [-72.447355, -47.738533],
  [-71.917258, -46.884838],
  [-71.552009, -45.560733],
  [-71.659316, -44.973689],
  [-71.222779, -44.784243],
  [-71.329801, -44.407522],
  [-71.793623, -44.207172],
  [-71.464056, -43.787611],
  [-71.915424, -43.408565],
  [-72.148898, -42.254888],
  [-71.746804, -42.051386],
  [-71.915734, -40.832339],
  [-71.680761, -39.808164],
  [-71.413517, -38.916022],
  [-70.814664, -38.552995],
  [-71.118625, -37.576827],
  [-71.121881, -36.658124],
  [-70.364769, -36.005089],
  [-70.388049, -35.169688],
  [-69.817309, -34.193571],
  [-69.814777, -33.273886],
  [-70.074399, -33.09121],
  [-70.535069, -31.36501],
  [-69.919008, -30.336339],
  [-70.01355, -29.367923],
  [-69.65613, -28.459141],
  [-69.001235, -27.521214],
  [-68.295542, -26.89934],
  [-68.5948, -26.506909],
  [-68.386001, -26.185016],
  [-68.417653, -24.518555],
  [-67.328443, -24.025303],
  [-66.985234, -22.986349],
  [-67.106674, -22.735925],
  [-66.273339, -21.83231],
  [-64.964892, -22.075862]
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

    const nodeAccumulator = new Map<
      string,
      { label: string; latSum: number; lonSum: number; count: number }
    >();

    for (const route of cleanedRoutes) {
      const originNode = nodeAccumulator.get(route.origen) ?? {
        label: route.origen,
        latSum: 0,
        lonSum: 0,
        count: 0
      };
      originNode.latSum += route.latitudOrigen;
      originNode.lonSum += route.longitudOrigen;
      originNode.count += 1;
      nodeAccumulator.set(route.origen, originNode);

      const destinationNode = nodeAccumulator.get(route.destino) ?? {
        label: route.destino,
        latSum: 0,
        lonSum: 0,
        count: 0
      };
      destinationNode.latSum += route.latitudDestino;
      destinationNode.lonSum += route.longitudDestino;
      destinationNode.count += 1;
      nodeAccumulator.set(route.destino, destinationNode);
    }

    const nodes = new Map<string, Node>();
    for (const [id, entry] of nodeAccumulator.entries()) {
      const projected = projectPoint(
        entry.latSum / entry.count,
        entry.lonSum / entry.count
      );
      nodes.set(id, {
        id,
        label: entry.label,
        ...projected
      });
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

  const highStressCount = useMemo(
    () => network.routes.filter((route) => (route.utilization ?? 0) >= 0.8).length,
    [network.routes]
  );

  const peakRouteFlow = useMemo(
    () => Math.max(...network.routes.map((route) => route.caudal ?? 0), 0),
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
          <Metric
            label="Tramos con caudal"
            value={`${dataset.stats.routesWithFlow}/${dataset.stats.routes}`}
          />
          <Metric label="Caudal maximo de tramo" value={`${formatNumber(peakRouteFlow)} MMm3/d`} />
          <Metric label="Tramos exigidos" value={`${highStressCount} sobre 73`} />
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
