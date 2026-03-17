import { useEffect, useMemo, useRef, useState } from "react";
import flowData from "../data/processed/powerbi-flows-latest.json";
import outlineData from "../data/processed/argentina-outline-3857.json";

type RouteBase = {
  ruta: string;
  origen: string;
  destino: string;
  gasoducto: string;
  latitudOrigen: number;
  longitudOrigen: number;
  latitudDestino: number;
  longitudDestino: number;
  xOrigen: number;
  yOrigen: number;
  xDestino: number;
  yDestino: number;
};

type RouteMetrics = {
  ruta: string;
  fecha: string;
  caudal: number | null;
  capacidad: number | null;
  fcf: string | null;
  sentido: string | null;
  utilization: number | null;
};

type Snapshot = {
  date: string;
  stats: {
    routes: number;
    routesWithFlow: number;
    routesWithCapacity: number;
    totalFlow: number;
    totalCapacity: number;
  };
  metrics: RouteMetrics[];
};

type FlowDataset = {
  latestDate: string;
  projection: string;
  availableDates: string[];
  routes: RouteBase[];
  snapshots: Snapshot[];
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

type ProjectedRoute = RouteBase & {
  start: Node;
  end: Node;
};

type DisplayRoute = ProjectedRoute & RouteMetrics & {
  strokeWidth: number;
};

type Transform = {
  scale: number;
  x: number;
  y: number;
};

type RouteHistoryPoint = {
  date: string;
  caudal: number | null;
  capacidad: number | null;
  utilization: number | null;
};

const dataset = flowData as FlowDataset;
const outline = outlineData as OutlineDataset;
const CANVAS_WIDTH = 920;
const CANVAS_HEIGHT = 760;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const INITIAL_TRANSFORM: Transform = { scale: 1, x: 0, y: 0 };
const TIMELINE_AUTOPLAY_MS = 1400;

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

function formatMonthLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...options
  }).format(date);
}

function snapshotHasOperationalData(snapshot: Snapshot) {
  return snapshot.metrics.some(
    (metric) =>
      metric.caudal != null || metric.capacidad != null || metric.utilization != null
  );
}

function buildSeriesPath(
  values: Array<number | null>,
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number }
) {
  const points = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value != null);

  if (points.length === 0) {
    return "";
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  return points
    .map((point, index) => {
      const x =
        padding.left +
        (points.length === 1 ? innerWidth / 2 : (point.index / (values.length - 1 || 1)) * innerWidth);
      const y = padding.top + innerHeight - (point.value / maxValue) * innerHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
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

function useProjectedNetwork(routes: RouteBase[], polygons: OutlinePoint[][]) {
  return useMemo(() => {
    const cleanedRoutes = routes.map((route) => ({
      ...route,
      ruta: fixText(route.ruta),
      origen: fixText(route.origen),
      destino: fixText(route.destino),
      gasoducto: fixText(route.gasoducto)
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

    const projectedRoutes: ProjectedRoute[] = cleanedRoutes.map((route) => ({
      ...route,
      start: nodes.get(route.origen)!,
      end: nodes.get(route.destino)!
    }));

    return {
      countryPath,
      nodes: Array.from(nodes.values()),
      routes: projectedRoutes,
      gasoductos: Array.from(
        new Set(cleanedRoutes.map((route) => route.gasoducto))
      ).sort()
    };
  }, [routes, polygons]);
}

export default function App() {
  const latestUsableDate = useMemo(() => {
    const latestSnapshotWithData = [...dataset.snapshots]
      .reverse()
      .find((snapshot) => snapshotHasOperationalData(snapshot));

    return latestSnapshotWithData?.date ?? dataset.latestDate;
  }, []);

  const [selectedGasoducto, setSelectedGasoducto] = useState("Todos");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [selectedDate, setSelectedDate] = useState(latestUsableDate);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState(false);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const network = useProjectedNetwork(dataset.routes, outline.polygons);

  const selectedSnapshot = useMemo(
    () =>
      dataset.snapshots.find((snapshot) => snapshot.date === selectedDate) ??
      dataset.snapshots[dataset.snapshots.length - 1],
    [selectedDate]
  );

  const datedRoutes = useMemo(() => {
    const metricsByRoute = new Map(
      selectedSnapshot.metrics.map((metric) => [
        fixText(metric.ruta),
        {
          ...metric,
          ruta: fixText(metric.ruta),
          fcf: fixText(metric.fcf),
          sentido: fixText(metric.sentido)
        }
      ])
    );

    const maxCaudal = Math.max(
      ...selectedSnapshot.metrics.map((metric) => metric.caudal ?? 0),
      1
    );

    return network.routes.map((route) => {
      const metric = metricsByRoute.get(route.ruta);
      const caudal = metric?.caudal ?? null;
      return {
        ...route,
        fecha: selectedSnapshot.date,
        caudal,
        capacidad: metric?.capacidad ?? null,
        fcf: metric?.fcf ?? null,
        sentido: metric?.sentido ?? null,
        utilization: metric?.utilization ?? null,
        strokeWidth: 1.6 + ((caudal ?? 0) / maxCaudal) * 10
      };
    });
  }, [network.routes, selectedSnapshot]);

  const visibleRoutes = useMemo(
    () =>
      datedRoutes.filter((route) => {
        const gasoductoMatch =
          selectedGasoducto === "Todos" || route.gasoducto === selectedGasoducto;
        const criticalMatch = !showCriticalOnly || (route.utilization ?? 0) >= 0.8;
        return gasoductoMatch && criticalMatch;
      }),
    [datedRoutes, selectedGasoducto, showCriticalOnly]
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
      [...visibleRoutes]
        .filter((route) => route.utilization != null)
        .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0))
        .slice(0, 6),
    [visibleRoutes]
  );

  const highStressCount = useMemo(
    () => datedRoutes.filter((route) => (route.utilization ?? 0) >= 0.8).length,
    [datedRoutes]
  );

  const peakRouteFlow = useMemo(
    () => Math.max(...datedRoutes.map((route) => route.caudal ?? 0), 0),
    [datedRoutes]
  );

  const selectedDetails = useMemo(
    () => datedRoutes.find((route) => route.ruta === selectedRouteId) ?? null,
    [datedRoutes, selectedRouteId]
  );
  const selectedVisibleRoute = useMemo(
    () => visibleRoutes.find((route) => route.ruta === selectedRouteId) ?? null,
    [visibleRoutes, selectedRouteId]
  );

  const selectedRouteHistory = useMemo<RouteHistoryPoint[]>(() => {
    if (!selectedRouteId) {
      return [];
    }

    return dataset.snapshots.map((snapshot) => {
      const metric = snapshot.metrics.find(
        (entry) => fixText(entry.ruta) === selectedRouteId
      );

      return {
        date: snapshot.date,
        caudal: metric?.caudal ?? null,
        capacidad: metric?.capacidad ?? null,
        utilization: metric?.utilization ?? null
      };
    });
  }, [selectedRouteId]);

  const availableDatesDescending = useMemo(
    () => [...dataset.availableDates].reverse(),
    []
  );

  const selectedDateIndex = useMemo(
    () => dataset.availableDates.findIndex((date) => date === selectedDate),
    [selectedDate]
  );

  const selectedDateLabel = useMemo(
    () => formatMonthLabel(selectedSnapshot.date, { month: "long", year: "numeric" }),
    [selectedSnapshot.date]
  );

  const selectedDateShortLabel = useMemo(
    () => formatMonthLabel(selectedSnapshot.date),
    [selectedSnapshot.date]
  );

  const selectedSnapshotHasData = useMemo(
    () => snapshotHasOperationalData(selectedSnapshot),
    [selectedSnapshot]
  );

  const timelineMarks = useMemo(
    () =>
      dataset.availableDates
        .map((date, index) => ({ date, index }))
        .filter(({ date, index }) => {
          const month = Number(date.split("-")[1]);
          return index === 0 || month === 1 || index === dataset.availableDates.length - 1;
        }),
    []
  );

  useEffect(() => {
    if (!isPlayingTimeline) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSelectedDate((currentDate) => {
        const currentIndex = dataset.availableDates.findIndex((date) => date === currentDate);
        const nextIndex = currentIndex + 1;
        if (nextIndex >= dataset.availableDates.length) {
          window.clearInterval(intervalId);
          setIsPlayingTimeline(false);
          return currentDate;
        }
        return dataset.availableDates[nextIndex];
      });
      setSelectedRouteId(null);
    }, TIMELINE_AUTOPLAY_MS);

    return () => window.clearInterval(intervalId);
  }, [isPlayingTimeline]);

  function setDateByIndex(nextIndex: number) {
    const safeIndex = Math.max(0, Math.min(dataset.availableDates.length - 1, nextIndex));
    setSelectedDate(dataset.availableDates[safeIndex]);
    setSelectedRouteId(null);
  }

  function stepDate(direction: -1 | 1) {
    setDateByIndex(selectedDateIndex + direction);
  }

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
    dragState.current = { x: event.clientX, y: event.clientY, moved: false };
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragState.current || transform.scale <= MIN_SCALE) {
      return;
    }

    const deltaX = event.clientX - dragState.current.x;
    const deltaY = event.clientY - dragState.current.y;
    const moved =
      dragState.current.moved || Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;

    dragState.current = { x: event.clientX, y: event.clientY, moved };
    if (moved) {
      setIsDragging(true);
    }

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
  }

  function handleRouteSelect(routeId: string) {
    if (dragState.current?.moved) {
      return;
    }

    setSelectedRouteId(routeId);
  }

  return (
    <div className="app-shell">
      <div className="backdrop" />
      <section className="control-bar">
        <div className="control-copy">
          <p className="eyebrow">Argentina Gas Grid</p>
          <h1>Flujo vs capacidad en la red de transporte</h1>
          <p className="lede">
            Cortes mensuales del dataset ENARGAS. Grosor por caudal, color por utilizacion.
          </p>
        </div>
        <label className="control-field">
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
        <label className="toggle control-field">
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
              <p>
                Corte {selectedDateShortLabel}. {selectedSnapshot.stats.routesWithFlow} tramos
                con caudal y {highStressCount} con uso mayor a 80%.
              </p>
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
                  <g key={route.ruta} className="route-hit">
                    <line
                      x1={route.start.x}
                      y1={route.start.y}
                      x2={route.end.x}
                      y2={route.end.y}
                      stroke="transparent"
                      strokeWidth={Math.max(route.strokeWidth + 10, 16)}
                      strokeLinecap="round"
                      className="route-hit-area"
                      onPointerUp={() => handleRouteSelect(route.ruta)}
                    />
                    <line
                      x1={route.start.x}
                      y1={route.start.y}
                      x2={route.end.x}
                      y2={route.end.y}
                      stroke={utilizationColor(route.utilization)}
                      strokeWidth={route.strokeWidth}
                      strokeLinecap="round"
                      opacity={selectedVisibleRoute && selectedVisibleRoute.ruta !== route.ruta ? 0.14 : 0.9}
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
            flujos y capacidades estimadas publicados en su reporte Power BI. Este MVP usa
            cortes mensuales para mantener la visualizacion liviana y comparable.
          </p>
        </section>

        <aside className="side-panel">
          <section className="detail-card detail-summary timeline-panel">
            <h3>Fecha</h3>
            <TimelineControls
              selectedDateLabel={selectedDateLabel}
              selectedDateIndex={selectedDateIndex}
              totalDates={dataset.availableDates.length}
              selectedSnapshotHasData={selectedSnapshotHasData}
              isPlayingTimeline={isPlayingTimeline}
              onStepBack={() => stepDate(-1)}
              onTogglePlay={() => {
                if (selectedDateIndex >= dataset.availableDates.length - 1) {
                  setDateByIndex(0);
                  setIsPlayingTimeline(true);
                  return;
                }
                setIsPlayingTimeline((current) => !current);
              }}
              onStepForward={() => stepDate(1)}
              onSliderChange={(value) => {
                setIsPlayingTimeline(false);
                setDateByIndex(value);
              }}
              timelineMarks={timelineMarks}
              availableDatesDescending={availableDatesDescending}
              selectedDate={selectedDate}
              onDatePick={(date) => {
                setIsPlayingTimeline(false);
                setSelectedDate(date);
                setSelectedRouteId(null);
              }}
            />
          </section>

          <section className="detail-card detail-summary">
            <h3>Lectura rapida</h3>
            <div className="detail-grid summary-grid">
              <Detail
                label="Tramos con caudal"
                value={`${selectedSnapshot.stats.routesWithFlow}/${selectedSnapshot.stats.routes}`}
              />
              <Detail label="Mes activo" value={selectedDateShortLabel} />
              <Detail label="Caudal maximo de tramo" value={`${formatNumber(peakRouteFlow)} MMm3/d`} />
              <Detail
                label="Tramos exigidos"
                value={
                  selectedSnapshotHasData
                    ? `${highStressCount} sobre 73`
                    : "Sin datos operativos"
                }
              />
            </div>
          </section>

          <section className="detail-card">
            <h3>Detalle del tramo</h3>
            {selectedDetails ? (
              <div className="detail-grid">
                <Detail label="Ruta" value={selectedDetails.ruta} />
                <Detail label="Gasoducto" value={selectedDetails.gasoducto} />
                <Detail label="Fecha" value={selectedDetails.fecha} />
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
                Elegi un tramo para ver sus metricas en la fecha seleccionada.
              </p>
            )}
          </section>

          <section className="detail-card">
            <h3>Serie historica del tramo</h3>
            {selectedDetails ? (
              <RouteHistoryChart
                routeName={selectedDetails.ruta}
                history={selectedRouteHistory}
                selectedDate={selectedDate}
              />
            ) : (
              <p className="empty-copy">
                Selecciona un tramo en el mapa o en la lista para ver su evolucion mensual.
              </p>
            )}
          </section>

          <section className="detail-card">
            <h3>Tramos mas exigidos</h3>
            <ul className="hot-list">
              {busiestRoutes.map((route) => (
                <li key={route.ruta}>
                  <button type="button" onClick={() => setSelectedRouteId(route.ruta)}>
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

function TimelineControls({
  selectedDateLabel,
  selectedDateIndex,
  totalDates,
  selectedSnapshotHasData,
  isPlayingTimeline,
  onStepBack,
  onTogglePlay,
  onStepForward,
  onSliderChange,
  timelineMarks,
  availableDatesDescending,
  selectedDate,
  onDatePick
}: {
  selectedDateLabel: string;
  selectedDateIndex: number;
  totalDates: number;
  selectedSnapshotHasData: boolean;
  isPlayingTimeline: boolean;
  onStepBack: () => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onSliderChange: (value: number) => void;
  timelineMarks: Array<{ date: string; index: number }>;
  availableDatesDescending: string[];
  selectedDate: string;
  onDatePick: (date: string) => void;
}) {
  return (
    <section className="timeline-card" aria-label="Controles temporales">
      <div className="timeline-heading">
        <div>
          <span className="timeline-label">Fecha activa</span>
          <strong>{selectedDateLabel}</strong>
        </div>
        <span className="timeline-range">
          {selectedDateIndex + 1}/{totalDates}
        </span>
      </div>
      {!selectedSnapshotHasData ? (
        <p className="timeline-warning">
          Este corte no trae caudal ni capacidad. Se puede recorrer la serie, pero no sirve
          para evaluar uso operativo de la red.
        </p>
      ) : null}
      <div className="timeline-actions">
        <button
          type="button"
          className="timeline-step"
          onClick={onStepBack}
          disabled={selectedDateIndex <= 0}
        >
          Mes anterior
        </button>
        <button type="button" className="timeline-play" onClick={onTogglePlay}>
          {isPlayingTimeline ? "Pausar" : "Reproducir"}
        </button>
        <button
          type="button"
          className="timeline-step"
          onClick={onStepForward}
          disabled={selectedDateIndex >= totalDates - 1}
        >
          Mes siguiente
        </button>
      </div>
      <label className="timeline-slider">
        <span className="sr-only">Mover en la serie mensual</span>
        <input
          type="range"
          min={0}
          max={totalDates - 1}
          step={1}
          value={selectedDateIndex}
          onChange={(event) => onSliderChange(Number(event.target.value))}
        />
      </label>
      <div className="timeline-marks" aria-hidden="true">
        {timelineMarks.map((mark) => (
          <span
            key={mark.date}
            style={{
              left: `${(mark.index / (totalDates - 1)) * 100}%`
            }}
          >
            {formatMonthLabel(mark.date, { year: "numeric" })}
          </span>
        ))}
      </div>
      <div className="timeline-presets">
        {availableDatesDescending.slice(0, 4).map((date) => (
          <button
            key={date}
            type="button"
            className={date === selectedDate ? "is-active" : ""}
            onClick={() => onDatePick(date)}
          >
            {formatMonthLabel(date)}
          </button>
        ))}
      </div>
    </section>
  );
}

function RouteHistoryChart({
  routeName,
  history,
  selectedDate
}: {
  routeName: string;
  history: RouteHistoryPoint[];
  selectedDate: string;
}) {
  const width = 420;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 28, left: 12 };
  const flowPath = buildSeriesPath(
    history.map((point) => point.caudal),
    width,
    height,
    padding
  );
  const capacityPath = buildSeriesPath(
    history.map((point) => point.capacidad),
    width,
    height,
    padding
  );
  const currentIndex = history.findIndex((point) => point.date === selectedDate);
  const currentPoint = history[currentIndex] ?? null;
  const maxValue = Math.max(
    ...history.flatMap((point) => [point.caudal ?? 0, point.capacidad ?? 0]),
    1
  );
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const markerX =
    currentIndex < 0
      ? null
      : padding.left + (currentIndex / (history.length - 1 || 1)) * innerWidth;
  const markerY =
    currentPoint?.caudal == null
      ? null
      : padding.top + innerHeight - (currentPoint.caudal / maxValue) * innerHeight;

  return (
    <div className="history-chart">
      <p className="history-title">{routeName}</p>
      <div className="history-legend">
        <span><i className="history-flow" /> Caudal</span>
        <span><i className="history-capacity" /> Capacidad</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="history-svg" role="img" aria-label={`Serie historica de ${routeName}`}>
        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          className="history-frame"
          rx="16"
        />
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + innerHeight * ratio}
            y2={padding.top + innerHeight * ratio}
            className="history-grid"
          />
        ))}
        {capacityPath ? <path d={capacityPath} className="history-capacity-line" /> : null}
        {flowPath ? <path d={flowPath} className="history-flow-line" /> : null}
        {markerX != null ? (
          <line
            x1={markerX}
            x2={markerX}
            y1={padding.top}
            y2={height - padding.bottom}
            className="history-marker"
          />
        ) : null}
        {markerX != null && markerY != null ? (
          <circle cx={markerX} cy={markerY} r="4.5" className="history-marker-dot" />
        ) : null}
      </svg>
      <div className="history-axis">
        <span>{formatMonthLabel(history[0].date)}</span>
        <span>{formatMonthLabel(history.at(-1)!.date)}</span>
      </div>
      <div className="history-stats">
        <Detail
          label="Caudal actual"
          value={
            currentPoint?.caudal == null
              ? "Sin dato"
              : `${formatNumber(currentPoint.caudal)} MMm3/d`
          }
        />
        <Detail
          label="Capacidad actual"
          value={
            currentPoint?.capacidad == null
              ? "Sin dato"
              : `${formatNumber(currentPoint.capacidad)} MMm3/d`
          }
        />
        <Detail
          label="Utilizacion actual"
          value={
            currentPoint?.utilization == null
              ? "Sin dato"
              : `${formatNumber(currentPoint.utilization * 100)}%`
          }
        />
      </div>
    </div>
  );
}
