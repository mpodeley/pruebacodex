import { useMemo, useRef, useState } from "react";
import flowData from "../data/processed/powerbi-flows-latest.json";
import outlineData from "../data/processed/argentina-outline-3857.json";

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
  xOrigen: number;
  yOrigen: number;
  xDestino: number;
  yDestino: number;
};

type FlowDataset = {
  latestDate: string;
  projection: string;
  stats: {
    routes: number;
    routesWithFlow: number;
    routesWithCapacity: number;
    totalFlow: number;
    totalCapacity: number;
  };
  routes: RouteRecord[];
};

type OutlinePoint = {
  lon: number;
  lat: number;
  x: number;
  y: number;
};

type OutlineDataset = {
  projection: string;
  polygons: OutlinePoint[][];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
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
const outline = outlineData as OutlineDataset;
const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 760;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
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

function useProjectedNetwork(routes: RouteRecord[], polygons: OutlinePoint[][]) {
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

    const allProjectedPoints = [
      ...cleanedRoutes.flatMap((route) => [
        { x: route.xOrigen, y: route.yOrigen },
        { x: route.xDestino, y: route.yDestino }
      ]),
      ...polygons.flat()
    ];

    const bounds = allProjectedPoints.reduce(
      (acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y)
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity
      }
    );

    const pad = 80;
    const scaleX = (CANVAS_WIDTH - pad * 2) / (bounds.maxX - bounds.minX || 1);
    const scaleY = (CANVAS_HEIGHT - pad * 2) / (bounds.maxY - bounds.minY || 1);
    const scale = Math.min(scaleX, scaleY);
    const usedWidth = (bounds.maxX - bounds.minX) * scale;
    const usedHeight = (bounds.maxY - bounds.minY) * scale;
    const offsetX = (CANVAS_WIDTH - usedWidth) / 2;
    const offsetY = (CANVAS_HEIGHT - usedHeight) / 2;

    const project = (x: number, y: number) => ({
      x: offsetX + (x - bounds.minX) * scale,
      y: CANVAS_HEIGHT - (offsetY + (y - bounds.minY) * scale)
    });

    const countryPath = polygons
      .map((polygon) =>
        polygon
          .map((point, index) => {
            const projected = project(point.x, point.y);
            return `${index === 0 ? "M" : "L"} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
          })
          .join(" ")
      )
      .join(" Z ")
      .concat(" Z");

    const nodeAccumulator = new Map<
      string,
      { label: string; xSum: number; ySum: number; count: number }
    >();

    for (const route of cleanedRoutes) {
      const originNode = nodeAccumulator.get(route.origen) ?? {
        label: route.origen,
        xSum: 0,
        ySum: 0,
        count: 0
      };
      originNode.xSum += route.xOrigen;
      originNode.ySum += route.yOrigen;
      originNode.count += 1;
      nodeAccumulator.set(route.origen, originNode);

      const destinationNode = nodeAccumulator.get(route.destino) ?? {
        label: route.destino,
        xSum: 0,
        ySum: 0,
        count: 0
      };
      destinationNode.xSum += route.xDestino;
      destinationNode.ySum += route.yDestino;
      destinationNode.count += 1;
      nodeAccumulator.set(route.destino, destinationNode);
    }

    const nodes = new Map<string, Node>();
    for (const [id, entry] of nodeAccumulator.entries()) {
      const projected = project(entry.xSum / entry.count, entry.ySum / entry.count);
      nodes.set(id, {
        id,
        label: entry.label,
        ...projected
      });
    }

    const maxCaudal = Math.max(...cleanedRoutes.map((route) => route.caudal ?? 0), 1);
    const networkRoutes: NetworkRoute[] = cleanedRoutes.map((route) => ({
      ...route,
      start: nodes.get(route.origen)!,
      end: nodes.get(route.destino)!,
      strokeWidth: 1.6 + ((route.caudal ?? 0) / maxCaudal) * 10
    }));

    return {
      countryPath,
      nodes: Array.from(nodes.values()),
      routes: networkRoutes,
      gasoductos: Array.from(
        new Set(cleanedRoutes.map((route) => route.gasoducto))
      ).sort()
    };
  }, [routes, polygons]);
}

export default function App() {
  const [selectedGasoducto, setSelectedGasoducto] = useState("Todos");
  const [selectedRoute, setSelectedRoute] = useState<NetworkRoute | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ x: number; y: number } | null>(null);

  const network = useProjectedNetwork(dataset.routes, outline.polygons);

  const visibleRoutes = useMemo(
    () =>
      network.routes.filter((route) => {
        const gasoductoMatch =
          selectedGasoducto === "Todos" || route.gasoducto === selectedGasoducto;
        const criticalMatch = !showCriticalOnly || (route.utilization ?? 0) >= 0.8;
        return gasoductoMatch && criticalMatch;
      }),
    [network.routes, selectedGasoducto, showCriticalOnly]
  );

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

  function clampTransform(next: Transform) {
    if (next.scale <= MIN_SCALE) {
      return INITIAL_TRANSFORM;
    }

    const minX = CANVAS_WIDTH - CANVAS_WIDTH * next.scale;
    const minY = CANVAS_HEIGHT - CANVAS_HEIGHT * next.scale;

    return {
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale)),
      x: Math.min(0, Math.max(minX, next.x)),
      y: Math.min(0, Math.max(minY, next.y))
    };
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.12;
    const pointerX = event.nativeEvent.offsetX;
    const pointerY = event.nativeEvent.offsetY;

    setTransform((current) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor));
      if (nextScale === current.scale) {
        return current;
      }

      const next = {
        scale: nextScale,
        x: pointerX - (pointerX - current.x) * (nextScale / current.scale),
        y: pointerY - (pointerY - current.y) * (nextScale / current.scale)
      };

      return clampTransform(next);
    });
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    dragState.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragState.current || transform.scale <= MIN_SCALE) {
      return;
    }

    const deltaX = event.clientX - dragState.current.x;
    const deltaY = event.clientY - dragState.current.y;
    dragState.current = { x: event.clientX, y: event.clientY };

    setTransform((current) =>
      clampTransform({
        ...current,
        x: current.x + deltaX,
        y: current.y + deltaY
      })
    );
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    dragState.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <section className="control-bar">
        <div className="control-copy">
          <p className="eyebrow">Argentina Gas Grid</p>
          <h1>Flujo vs capacidad en la red de transporte</h1>
          <p className="lede">
            Fecha de corte {dataset.latestDate}. Grosor por caudal, color por utilizacion.
          </p>
        </div>
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
        <button type="button" className="reset-view" onClick={() => setTransform(INITIAL_TRANSFORM)}>
          Recentrar vista
        </button>
      </section>

      <main className="layout">
        <section className="map-panel">
          <div className="panel-heading">
            <div>
              <h2>Red proyectada</h2>
              <p>El grosor representa caudal y el color representa utilizacion.</p>
            </div>
            <Legend />
          </div>
          <svg
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            className={`network-map ${isDragging ? "is-dragging" : ""}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
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
            <g transform={`translate(${transform.x} ${transform.y})`}>
              <g transform={`scale(${transform.scale})`}>
              <path d={network.countryPath} className="country-fill" />
              <rect
                x="30"
                y="30"
                width={CANVAS_WIDTH - 60}
                height={CANVAS_HEIGHT - 60}
                rx="30"
                className="map-frame"
              />
              <path d={network.countryPath} className="country-outline" />
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
            </g>
          </svg>
          <p className="map-note">
            Datos visibles: topologia y geometria de capas publicas de ENARGAS en ArcGIS, mas
            flujos y capacidades estimadas publicados en su reporte Power BI. La visualizacion
            muestra el ultimo corte disponible del dataset.
          </p>
        </section>

        <aside className="side-panel">
          <section className="detail-card detail-summary">
            <h3>Lectura rapida</h3>
            <div className="detail-grid summary-grid">
              <Detail label="Tramos con caudal" value={`${dataset.stats.routesWithFlow}/${dataset.stats.routes}`} />
              <Detail label="Caudal maximo de tramo" value={`${formatNumber(peakRouteFlow)} MMm3/d`} />
              <Detail label="Tramos exigidos" value={`${highStressCount} sobre 73`} />
            </div>
          </section>

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
