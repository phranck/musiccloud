import { DashboardButton } from "@musiccloud/dashboard-ui";
import { ENDPOINTS } from "@musiccloud/shared";
import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CrosshairIcon,
  GlobeHemisphereWestIcon,
  HouseIcon,
  MapPinIcon,
  PulseIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { geoGraticule, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson";
import { memo, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryObject, Topology } from "topojson-specification";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";

type GeoActivity = "page_view" | "search" | "resolve" | "listen" | "player" | "interaction" | "bot";

interface CountryProperties {
  isoA2: string;
  isoA3: string;
  name: string;
}

interface GeoPoint {
  id: string;
  occurredAt: string;
  eventType: string;
  activity: GeoActivity;
  latitude: number;
  longitude: number;
  accuracyRadiusKm: number | null;
  countryCode: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
  path: string | null;
  routeTemplate: string | null;
  surface: string | null;
  elementKey: string | null;
  deviceClass: string | null;
  isBot: boolean;
}

interface GeoLocationSummary {
  countryCode: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  events: number;
  clusters: number;
  lastSeenAt: string;
}

interface GeoCountrySummary {
  countryCode: string | null;
  events: number;
  clusters: number;
  cities: number;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string;
}

interface GeoOverview {
  generatedAt: string;
  since: string;
  realtimeSince: string;
  coverage: {
    totalEvents: number;
    geolocatedEvents: number;
    countries: number;
    latestDatabaseBuildAt: string | null;
  };
  countries: GeoCountrySummary[];
  cities: GeoLocationSummary[];
  recent: GeoPoint[];
}

type GeoIpStatusState = "disabled" | "fresh" | "stale" | "missing" | "updating" | "error";

interface GeoIpStatus {
  state: GeoIpStatusState;
  provider: string;
  databasePath: string;
  databaseType: string | null;
  buildEpoch: string | null;
  lastModifiedAt: string | null;
  ageDays: number | null;
  maxAgeDays: number;
  message: string | null;
  latestRelease: string | null;
  latestReleaseAt: string | null;
  lastDownloadedAt: string | null;
  updateAvailable: boolean | null;
}

interface GeoIpUpdateResult {
  ok: boolean;
  status: GeoIpStatus;
  message: string;
}

interface LivePoint extends GeoPoint {
  receivedAt: number;
}

interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  unitsPerPixelX: number;
  unitsPerPixelY: number;
}

interface WorldMapGeometry {
  borders: MultiLineString;
  countries: FeatureCollection<Geometry, CountryProperties>;
}

interface CountryPath {
  d: string;
  key: string;
  name: string;
}

type MapDetailLevel = "base" | "borders" | "labels";

const MAP_WIDTH = 1400;
const MAP_HEIGHT = 620;
const MAX_POINTS = 320;
const FLASH_MS = 1_800;
const PULSE_MS = 60_000;
const FADE_MS = 18_000;
const POINT_TTL_MS = FLASH_MS + PULSE_MS + FADE_MS;
const MAP_PADDING_X = 34;
const MAP_PADDING_Y = 28;
const HOME_ANIMATION_MS = 820;
const MAX_MAP_SCALE = 10;
const INITIAL_MAP_VIEW: ViewTransform = { scale: 1, x: 0, y: 0 };
const MAP_VIEW_STORAGE_KEY = "musiccloud.analytics.realtime.mapView.v1";
const WORLD_TOPOLOGY_URL = `${import.meta.env.BASE_URL}map-data/natural-earth-countries-50m.json`;

const ACTIVITY_META: Record<GeoActivity, { color: string; label: string }> = {
  page_view: { color: "#56d8ff", label: "Page View" },
  search: { color: "#fff177", label: "Search" },
  resolve: { color: "#64ff9a", label: "Resolve" },
  listen: { color: "#ff6dcb", label: "Listen" },
  player: { color: "#ff9c5a", label: "Player" },
  interaction: { color: "#b79cff", label: "Interaction" },
  bot: { color: "#8a96a8", label: "Bot" },
};

const WORLD_GRATICULE = geoGraticule();
let worldGeometryPromise: Promise<WorldMapGeometry> | null = null;

function parseWorldMapTopology(rawTopology: unknown): WorldMapGeometry {
  const topology = rawTopology as Topology<{ countries: GeometryObject<CountryProperties> }>;
  return {
    borders: mesh(topology, topology.objects.countries, (a, b) => a !== b) as MultiLineString,
    countries: feature<CountryProperties>(topology, topology.objects.countries) as unknown as FeatureCollection<
      Geometry,
      CountryProperties
    >,
  };
}

function loadWorldMapGeometry() {
  worldGeometryPromise ??= fetch(WORLD_TOPOLOGY_URL).then(async (response) => {
    if (!response.ok) throw new Error(`Failed to load world map data: ${response.status}`);
    return parseWorldMapTopology(await response.json());
  });
  return worldGeometryPromise;
}

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("admin_token");
    if (!stored) return null;
    const { token } = JSON.parse(stored) as { token: string | null };
    return token ?? null;
  } catch {
    return null;
  }
}

function pointKey(point: GeoPoint) {
  return point.id;
}

function pointReceivedAt(point: GeoPoint) {
  const occurredAt = new Date(point.occurredAt).getTime();
  return Number.isFinite(occurredAt) ? occurredAt : Date.now();
}

function pointAge(point: LivePoint, now: number) {
  return Math.max(0, now - point.receivedAt);
}

function pointOpacity(point: LivePoint, now: number) {
  const age = pointAge(point, now);
  if (age <= FLASH_MS + PULSE_MS) return 1;
  return Math.max(0, 1 - (age - FLASH_MS - PULSE_MS) / FADE_MS);
}

function activityLabel(activity: GeoActivity) {
  return ACTIVITY_META[activity]?.label ?? activity;
}

function mapDetailLevel(scale: number): MapDetailLevel {
  if (scale >= 2.35) return "labels";
  if (scale >= 1.55) return "borders";
  return "base";
}

function mapTransform({ scale, x, y }: ViewTransform) {
  return `translate(${x} ${y}) scale(${scale})`;
}

function clampMapView(view: ViewTransform): ViewTransform {
  return {
    scale: Math.min(MAX_MAP_SCALE, Math.max(1, view.scale)),
    x: Number.isFinite(view.x) ? view.x : 0,
    y: Number.isFinite(view.y) ? view.y : 0,
  };
}

function readPersistedMapView(): ViewTransform {
  try {
    const raw = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) return INITIAL_MAP_VIEW;
    const parsed = JSON.parse(raw) as Partial<ViewTransform>;
    if (typeof parsed.scale !== "number" || typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return INITIAL_MAP_VIEW;
    }
    return clampMapView({ scale: parsed.scale, x: parsed.x, y: parsed.y });
  } catch {
    return INITIAL_MAP_VIEW;
  }
}

function persistMapView(view: ViewTransform) {
  try {
    localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(clampMapView(view)));
  } catch {
    // localStorage can be unavailable in restricted browser modes.
  }
}

function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
}

function interpolateMapView(from: ViewTransform, to: ViewTransform, progress: number): ViewTransform {
  return {
    scale: from.scale + (to.scale - from.scale) * progress,
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function geoIpStatusTone(state: GeoIpStatusState | undefined) {
  if (state === "fresh") return "text-[#64ff9a]";
  if (state === "updating") return "text-[#56d8ff]";
  if (state === "disabled" || state === "missing" || state === "stale") return "text-[#fff177]";
  return "text-[#ff6d6d]";
}

function formatStatusDate(value: string | null | undefined) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function mergeLivePoints(previous: LivePoint[], incoming: GeoPoint[], now: number) {
  const map = new Map<string, LivePoint>();
  for (const point of previous) {
    if (now - point.receivedAt <= POINT_TTL_MS) map.set(pointKey(point), point);
  }
  for (const point of incoming) {
    map.set(pointKey(point), { ...point, receivedAt: pointReceivedAt(point) });
  }
  return Array.from(map.values())
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .slice(0, MAX_POINTS);
}

function useWebsiteAnalyticsRealtimeStream(onPoint: (point: GeoPoint) => void) {
  const onPointRef = useRef(onPoint);

  useEffect(() => {
    onPointRef.current = onPoint;
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let active = true;
    let controller = new AbortController();
    let reconnectTimer: number | undefined;

    async function connect() {
      controller = new AbortController();
      try {
        const res = await fetch(ENDPOINTS.admin.analytics.website.realtime, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          if (active) reconnectTimer = window.setTimeout(connect, 3000);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "";
        let eventData = "";

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6).trim();
            } else if (line === "" && eventType === "website-analytics-geo-event" && eventData) {
              try {
                onPointRef.current(JSON.parse(eventData) as GeoPoint);
              } catch {}
              eventType = "";
              eventData = "";
            }
          }
        }
      } catch {
        // Aborted or temporary network error.
      }

      if (active) reconnectTimer = window.setTimeout(connect, 3000);
    }

    void connect();

    return () => {
      active = false;
      controller.abort();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, []);
}

function useWorldMapGeometry() {
  const [geometry, setGeometry] = useState<WorldMapGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadWorldMapGeometry()
      .then((loadedGeometry) => {
        if (!active) return;
        setGeometry(loadedGeometry);
        setError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setGeometry(null);
        setError(error instanceof Error ? error.message : "Failed to load world map data");
      });
    return () => {
      active = false;
    };
  }, []);

  return { error, geometry };
}

const StaticWorldLayer = memo(function StaticWorldLayer({
  borderPath,
  countryPaths,
  detailLevel,
  graticulePath,
  loadError,
  isLoaded,
}: {
  borderPath: string;
  countryPaths: CountryPath[];
  detailLevel: MapDetailLevel;
  graticulePath: string;
  loadError: string | null;
  isLoaded: boolean;
}) {
  return (
    <>
      <path
        d={graticulePath}
        fill="none"
        stroke="#1c86ff"
        strokeOpacity={detailLevel === "base" ? 0.14 : 0.22}
        strokeWidth="0.7"
        vectorEffect="non-scaling-stroke"
      />
      {!isLoaded && !loadError && (
        <text
          x={MAP_WIDTH / 2}
          y={MAP_HEIGHT / 2}
          fill="#72dcff"
          fontSize="14"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          opacity="0.76"
          textAnchor="middle"
        >
          LOADING MAP DATA
        </text>
      )}
      {!isLoaded && loadError && (
        <text
          x={MAP_WIDTH / 2}
          y={MAP_HEIGHT / 2}
          fill="#fff177"
          fontSize="14"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          opacity="0.86"
          textAnchor="middle"
        >
          <tspan x={MAP_WIDTH / 2}>MAP DATA UNAVAILABLE</tspan>
          <tspan x={MAP_WIDTH / 2} dy="22" fontSize="11" opacity="0.72">
            {loadError}
          </tspan>
        </text>
      )}
      {countryPaths.map((country) => (
        <path
          key={country.key}
          d={country.d}
          aria-label={country.name}
          fill="rgba(17, 124, 210, 0.052)"
          stroke="#5ecbff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={detailLevel === "base" ? 0.72 : 0.48}
          strokeWidth={detailLevel === "base" ? 1.15 : 0.85}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {detailLevel !== "base" && borderPath && (
        <path
          d={borderPath}
          fill="none"
          stroke="#77d8ff"
          strokeOpacity={detailLevel === "labels" ? 0.46 : 0.28}
          strokeWidth="0.55"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  );
});

const CityLayer = memo(function CityLayer({
  cities,
  detailLevel,
  projection,
}: {
  cities: GeoLocationSummary[];
  detailLevel: MapDetailLevel;
  projection: ReturnType<typeof geoNaturalEarth1> | null;
}) {
  const visibleCities =
    detailLevel === "labels"
      ? cities.slice(0, 28)
      : detailLevel === "borders"
        ? cities.slice(0, 18)
        : cities.slice(0, 8);

  return (
    <>
      {visibleCities.map((city) => {
        if (!projection) return null;
        const projected = projection([city.longitude, city.latitude]);
        if (!projected) return null;
        const [x, y] = projected;
        return (
          <g key={`${city.countryCode ?? "xx"}-${city.regionName ?? "region"}-${city.city ?? "city"}`}>
            <circle cx={x} cy={y} r="2.4" fill="#2ad7ff" opacity={0.48} />
            {detailLevel === "labels" && (
              <text x={x + 6} y={y - 4} fill="#83ddff" fontSize="10" opacity={0.72}>
                {city.city ?? city.regionName ?? city.countryCode ?? "Unknown"}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
});

function RealtimeWorldMap({
  cities,
  now,
  points,
  resetSignal,
}: {
  cities: GeoLocationSummary[];
  now: number;
  points: LivePoint[];
  resetSignal: number;
}) {
  const initialViewRef = useRef<ViewTransform>(readPersistedMapView());
  const animationFrameRef = useRef<number | null>(null);
  const [detailLevel, setDetailLevel] = useState<MapDetailLevel>(() => mapDetailLevel(initialViewRef.current.scale));
  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const hasResetSignalMountedRef = useRef(false);
  const mapLayerRef = useRef<SVGGElement | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<ViewTransform>(initialViewRef.current);
  const zoomTextRef = useRef<SVGTextElement | null>(null);
  const { error: mapLoadError, geometry: mapGeometry } = useWorldMapGeometry();
  const projection = useMemo(() => {
    if (!mapGeometry) return null;
    return geoNaturalEarth1().fitExtent(
      [
        [MAP_PADDING_X, MAP_PADDING_Y],
        [MAP_WIDTH - MAP_PADDING_X, MAP_HEIGHT - MAP_PADDING_Y],
      ],
      mapGeometry.countries,
    );
  }, [mapGeometry]);
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);
  const countryPaths = useMemo(() => {
    if (!mapGeometry || !path) return [];
    return mapGeometry.countries.features
      .map((country: Feature<Geometry, CountryProperties>, index) => ({
        d: path(country),
        key: country.properties.isoA3 || country.properties.isoA2 || country.properties.name || `country-${index}`,
        name: country.properties.name,
      }))
      .filter((country): country is { d: string; key: string; name: string } => typeof country.d === "string");
  }, [mapGeometry, path]);
  const borderPath = useMemo(() => (mapGeometry && path ? (path(mapGeometry.borders) ?? "") : ""), [mapGeometry, path]);
  const graticulePaths = useMemo(() => {
    if (!path) return "";
    return {
      base: path(WORLD_GRATICULE.step([30, 30])()) ?? "",
      borders: path(WORLD_GRATICULE.step([15, 15])()) ?? "",
      labels: path(WORLD_GRATICULE.step([10, 10])()) ?? "",
    };
  }, [path]);

  const applyTransform = useCallback((nextView: ViewTransform) => {
    const currentView = clampMapView(nextView);
    viewRef.current = currentView;
    mapLayerRef.current?.setAttribute("transform", mapTransform(currentView));
    if (zoomTextRef.current) zoomTextRef.current.textContent = `ZOOM ${currentView.scale.toFixed(2)}X`;
  }, []);

  const schedulePersist = useCallback((nextView: ViewTransform) => {
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      persistMapView(nextView);
    }, 180);
  }, []);

  const scheduleTransformUpdate = useCallback(
    (nextView: ViewTransform, persist = false) => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      const currentView = clampMapView(nextView);
      viewRef.current = currentView;
      const nextDetailLevel = mapDetailLevel(currentView.scale);
      setDetailLevel((currentDetailLevel) =>
        currentDetailLevel === nextDetailLevel ? currentDetailLevel : nextDetailLevel,
      );
      if (persist) schedulePersist(currentView);
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        applyTransform(viewRef.current);
      });
    },
    [applyTransform, schedulePersist],
  );

  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    applyTransform(viewRef.current);
  }, [applyTransform]);

  useEffect(() => {
    if (resetSignal === 0 && !hasResetSignalMountedRef.current) {
      hasResetSignalMountedRef.current = true;
      return;
    }
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);

    const startView = viewRef.current;
    const startTime = performance.now();

    const tick = (time: number) => {
      const progress = Math.min(1, (time - startTime) / HOME_ANIMATION_MS);
      const nextView = interpolateMapView(startView, INITIAL_MAP_VIEW, easeOutExpo(progress));
      viewRef.current = nextView;
      applyTransform(nextView);
      const nextDetailLevel = mapDetailLevel(nextView.scale);
      setDetailLevel((currentDetailLevel) =>
        currentDetailLevel === nextDetailLevel ? currentDetailLevel : nextDetailLevel,
      );

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      animationFrameRef.current = null;
      viewRef.current = INITIAL_MAP_VIEW;
      applyTransform(INITIAL_MAP_VIEW);
      persistMapView(INITIAL_MAP_VIEW);
      setDetailLevel("base");
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
  }, [applyTransform, resetSignal]);

  const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const currentView = viewRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: currentView.x,
      originY: currentView.y,
      unitsPerPixelX: MAP_WIDTH / rect.width,
      unitsPerPixelY: MAP_HEIGHT / rect.height,
    };
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const currentView = viewRef.current;
      scheduleTransformUpdate({
        ...currentView,
        x: drag.originX + (event.clientX - drag.startX) * drag.unitsPerPixelX,
        y: drag.originY + (event.clientY - drag.startY) * drag.unitsPerPixelY,
      });
    },
    [scheduleTransformUpdate],
  );

  const handlePointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      persistMapView(viewRef.current);
    }
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
      const py = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
      const currentView = viewRef.current;
      const nextScale = Math.min(MAX_MAP_SCALE, Math.max(1, currentView.scale * (event.deltaY < 0 ? 1.16 : 0.86)));
      const ratio = nextScale / currentView.scale;

      scheduleTransformUpdate(
        {
          scale: nextScale,
          x: px - (px - currentView.x) * ratio,
          y: py - (py - currentView.y) * ratio,
        },
        true,
      );
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [scheduleTransformUpdate]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#1e8cff66] bg-[#020a12] shadow-[0_0_36px_rgba(31,139,255,0.18)_inset]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-[min(74vh,740px)] min-h-[520px] w-full touch-none select-none"
        role="img"
        aria-label="Realtime website activity world map"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerUp}
        onPointerUp={handlePointerUp}
      >
        <defs>
          <filter id="vfdGlow">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="mapVignette" cx="50%" cy="50%" r="68%">
            <stop offset="0%" stopColor="#05213a" stopOpacity="0.42" />
            <stop offset="70%" stopColor="#020a12" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#00050a" stopOpacity="0.82" />
          </radialGradient>
        </defs>
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#mapVignette)" />
        <g ref={mapLayerRef}>
          <StaticWorldLayer
            borderPath={borderPath}
            countryPaths={countryPaths}
            detailLevel={detailLevel}
            graticulePath={graticulePaths ? graticulePaths[detailLevel] : ""}
            loadError={mapLoadError}
            isLoaded={Boolean(mapGeometry)}
          />
          <CityLayer cities={cities} detailLevel={detailLevel} projection={projection} />
          {points.map((point) => {
            if (!projection) return null;
            const projected = projection([point.longitude, point.latitude]);
            if (!projected) return null;
            const [x, y] = projected;
            const meta = ACTIVITY_META[point.activity] ?? ACTIVITY_META.interaction;
            const age = pointAge(point, now);
            const opacity = pointOpacity(point, now);
            const flash = age <= FLASH_MS;
            const pulse = age <= FLASH_MS + PULSE_MS;
            const radius = flash ? 8 : pulse ? 4.8 + Math.sin(now / 280) * 1.4 : 3.5;
            return (
              <g key={point.id} opacity={opacity}>
                {flash && (
                  <circle
                    cx={x}
                    cy={y}
                    r={18}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={1.4}
                    opacity={0.95}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {pulse && (
                  <circle
                    cx={x}
                    cy={y}
                    r={radius + 8}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={0.8}
                    opacity={0.36}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={meta.color}
                  stroke="#dff8ff"
                  strokeWidth={0.7}
                  filter="url(#vfdGlow)"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </g>
        <g opacity="0.78">
          <rect x="18" y="18" width="176" height="32" fill="rgba(2,10,18,0.72)" stroke="#1e8cff66" />
          <text
            ref={zoomTextRef}
            x="32"
            y="39"
            fill="#72dcff"
            fontSize="14"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            ZOOM 1.00X
          </text>
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,rgba(125,220,255,0.06)_0,rgba(125,220,255,0.06)_1px,transparent_1px,transparent_5px)] mix-blend-screen" />
    </div>
  );
}

function ActivityLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--ds-text-muted)]">
      {(Object.keys(ACTIVITY_META) as GeoActivity[]).map((activity) => (
        <span key={activity} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: ACTIVITY_META[activity].color }} />
          {activityLabel(activity)}
        </span>
      ))}
    </div>
  );
}

function TopLocationList({ cities }: { cities: GeoLocationSummary[] }) {
  const { formatNumber } = useI18n();
  return (
    <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
      {cities.slice(0, 8).map((city) => (
        <div
          key={`${city.countryCode ?? "xx"}-${city.regionName ?? "region"}-${city.city ?? "city"}`}
          className="rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-3 py-2"
        >
          <div className="flex items-center gap-2 text-[var(--ds-text)]">
            <MapPinIcon weight="duotone" className="size-4 text-[var(--ds-text-muted)]" />
            <span className="truncate">{city.city ?? city.regionName ?? city.countryCode ?? "Unknown"}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-[var(--ds-text-muted)]">
            <span>{city.countryCode ?? "unknown"}</span>
            <span className="tabular-nums">{formatNumber(city.events)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DbIpControl({
  isLoading,
  isUpdating,
  onUpdate,
  status,
  updateMessage,
}: {
  isLoading: boolean;
  isUpdating: boolean;
  onUpdate: () => void;
  status: GeoIpStatus | undefined;
  updateMessage: string | null;
}) {
  const { messages } = useI18n();
  const state = status?.state;
  const Icon = state === "fresh" ? CheckCircleIcon : WarningCircleIcon;
  const age =
    status?.ageDays === null || status?.ageDays === undefined
      ? "n/a"
      : `${status.ageDays.toFixed(1)} / ${status.maxAgeDays}d`;

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<Icon weight="duotone" className={`size-4 ${geoIpStatusTone(state)}`} />}
        title="DB-IP"
        addOn={
          <DashboardButton
            type="button"
            onClick={isUpdating ? undefined : onUpdate}
            aria-disabled={isUpdating}
            className={isUpdating ? "cursor-progress" : undefined}
            disabled={state === "disabled"}
            leadingIcon={
              <ArrowClockwiseIcon weight="duotone" className={`size-3.5 ${isUpdating ? "animate-spin" : ""}`} />
            }
            size="action"
            variant="primary"
          >
            {isUpdating ? messages.common.loading : "Update"}
          </DashboardButton>
        }
      />
      <DashboardSection.Body>
        <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-1">
          <div>
            <div className="text-xs text-[var(--ds-text-muted)]">Status</div>
            <div className={`capitalize tabular-nums text-lg ${geoIpStatusTone(state)}`}>
              {isLoading ? messages.common.loading : (state ?? "unknown")}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--ds-text-muted)]">Age</div>
            <div className="tabular-nums text-lg text-[var(--ds-text)]">{age}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--ds-text-muted)]">Build</div>
            <div className="truncate text-sm text-[var(--ds-text)]">{formatStatusDate(status?.buildEpoch)}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--ds-text-muted)]">Database</div>
            <div className="truncate text-sm text-[var(--ds-text)]">{status?.databaseType ?? "n/a"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--ds-text-muted)]">Latest</div>
            <div className="truncate text-sm text-[var(--ds-text)]">
              {status?.latestRelease ?? (status?.updateAvailable === null ? "unknown" : "n/a")}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--ds-text-muted)]">Update</div>
            <div className={`text-sm ${status?.updateAvailable ? "text-[#fff177]" : "text-[var(--ds-text)]"}`}>
              {status?.updateAvailable === true
                ? "available"
                : status?.updateAvailable === false
                  ? "current"
                  : "unknown"}
            </div>
          </div>
        </div>
        <a
          href="https://db-ip.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-[var(--ds-text-muted)] underline decoration-[#56d8ff55] underline-offset-4 hover:text-[var(--ds-text)]"
        >
          IP Geolocation by DB-IP
        </a>
        {(status?.message || updateMessage) && (
          <div className="rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface-muted)] px-3 py-2 text-xs text-[var(--ds-text-muted)]">
            {updateMessage ?? status?.message}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

export function WebsiteAnalyticsRealtimePage() {
  const { messages, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const [points, setPoints] = useState<LivePoint[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [mapResetSignal, setMapResetSignal] = useState(0);
  const geoQuery = useQuery({
    queryKey: ["website-analytics-geo-realtime"],
    queryFn: () =>
      api.get<GeoOverview>(`${ENDPOINTS.admin.analytics.website.geo}?period=today&realtimeMinutes=5&limit=250`),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const geoIpStatusQuery = useQuery({
    queryKey: ["website-analytics-geoip-status"],
    queryFn: () => api.get<GeoIpStatus>(ENDPOINTS.admin.analytics.website.geoIpStatus),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const geoIpUpdateMutation = useMutation({
    mutationFn: () => api.post<GeoIpUpdateResult>(ENDPOINTS.admin.analytics.website.geoIpUpdate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-geoip-status"] });
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-geo-realtime"] });
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!geoQuery.data?.recent) return;
    setPoints((previous) => mergeLivePoints(previous, geoQuery.data.recent, Date.now()));
  }, [geoQuery.data?.recent]);

  useWebsiteAnalyticsRealtimeStream(
    useCallback((point) => {
      setPoints((previous) => mergeLivePoints(previous, [point], Date.now()));
    }, []),
  );

  const visiblePoints = useMemo(() => points.filter((point) => pointOpacity(point, now) > 0), [now, points]);
  const coverage = geoQuery.data?.coverage;
  const cities = geoQuery.data?.cities ?? [];
  const countries = geoQuery.data?.countries ?? [];

  return (
    <PageLayout>
      <PageHeader title={messages.layout.sidebar.websiteAnalyticsRealtime} />
      <PageBody className="overflow-y-auto -mx-3 -mt-3 px-3 pt-3 pb-3">
        <div className="grid gap-3">
          <DashboardSection>
            <DashboardSection.Header
              icon={<GlobeHemisphereWestIcon weight="duotone" className="size-4" />}
              title="Control Room"
              addOn={
                <div className="flex items-center gap-2">
                  <DashboardButton
                    type="button"
                    onClick={() => setMapResetSignal((current) => current + 1)}
                    leadingIcon={<HouseIcon weight="duotone" className="size-3.5" />}
                    size="action"
                    variant="neutral"
                  >
                    Home
                  </DashboardButton>
                  <div className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
                    <PulseIcon weight="duotone" className="size-4 text-[#64ff9a]" />
                    <span className="tabular-nums">{formatNumber(visiblePoints.length)}</span>
                  </div>
                </div>
              }
            />
            <DashboardSection.Body className="gap-3">
              <RealtimeWorldMap cities={cities} now={now} points={visiblePoints} resetSignal={mapResetSignal} />
              <ActivityLegend />
            </DashboardSection.Body>
          </DashboardSection>

          <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
            <DashboardSection>
              <DashboardSection.Header icon={<MapPinIcon weight="duotone" className="size-4" />} title="Locations" />
              <DashboardSection.Body>
                <TopLocationList cities={cities} />
              </DashboardSection.Body>
            </DashboardSection>

            <div className="grid gap-3">
              <DbIpControl
                isLoading={geoIpStatusQuery.isLoading}
                isUpdating={geoIpUpdateMutation.isPending || geoIpStatusQuery.data?.state === "updating"}
                onUpdate={() => geoIpUpdateMutation.mutate()}
                status={geoIpStatusQuery.data}
                updateMessage={geoIpUpdateMutation.data?.message ?? null}
              />

              <DashboardSection>
                <DashboardSection.Header icon={<CrosshairIcon weight="duotone" className="size-4" />} title="Signal" />
                <DashboardSection.Body>
                  <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-1">
                    <div>
                      <div className="text-xs text-[var(--ds-text-muted)]">Geo Events</div>
                      <div className="tabular-nums text-lg text-[var(--ds-text)]">
                        {formatNumber(coverage?.geolocatedEvents ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--ds-text-muted)]">Countries</div>
                      <div className="tabular-nums text-lg text-[var(--ds-text)]">
                        {formatNumber(coverage?.countries ?? countries.length)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--ds-text-muted)]">Total Events</div>
                      <div className="tabular-nums text-lg text-[var(--ds-text)]">
                        {formatNumber(coverage?.totalEvents ?? 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--ds-text-muted)]">MMDB Build</div>
                      <div className="truncate text-sm text-[var(--ds-text)]">
                        {coverage?.latestDatabaseBuildAt
                          ? new Date(coverage.latestDatabaseBuildAt).toLocaleDateString()
                          : geoQuery.isLoading
                            ? messages.common.loading
                            : "n/a"}
                      </div>
                    </div>
                  </div>
                </DashboardSection.Body>
              </DashboardSection>
            </div>
          </div>
        </div>
      </PageBody>
    </PageLayout>
  );
}
