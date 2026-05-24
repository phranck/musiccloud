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
import { geoContains, geoGraticule, geoNaturalEarth1, geoPath } from "d3-geo";
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
  persistent?: boolean;
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
  outline: MultiLineString;
}

interface CountryPath {
  d: string;
  feature: Feature<Geometry, CountryProperties>;
  key: string;
  name: string;
}

interface HoveredCountry {
  d: string;
  key: string;
  name: string;
  x: number;
  y: number;
}

interface HoveredPoint {
  details: string[];
  key: string;
  title: string;
  x: number;
  y: number;
}

type MapDetailLevel = "base" | "borders" | "labels";

const MAP_WIDTH = 1400;
const MAP_HEIGHT = 620;
const MAX_POINTS = 320;
const FLASH_MS = 900;
const PULSE_MS = 30_000;
const PULSE_CYCLE_MS = 3_600;
const FADE_MS = 10_000;
const POINT_TTL_MS = FLASH_MS + PULSE_MS + FADE_MS;
const LIVE_POINT_RADIUS = 4.7;
const IDLE_POINT_RADIUS = 4.2;
const IDLE_POINT_BREATH_MS = 4_800;
const MAP_PADDING_X = 34;
const MAP_PADDING_Y = 28;
const HOME_ANIMATION_MS = 820;
const GEOIP_UPDATE_TIMEOUT_MS = 300_000;
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
    outline: mesh(topology, topology.objects.countries, (a, b) => a === b) as MultiLineString,
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
  if (point.persistent) return 1;
  const age = pointAge(point, now);
  if (age <= FLASH_MS + PULSE_MS) return 1;
  return Math.max(0, 1 - (age - FLASH_MS - PULSE_MS) / FADE_MS);
}

function idlePointBreath(now: number) {
  const progress = (now % IDLE_POINT_BREATH_MS) / IDLE_POINT_BREATH_MS;
  return 0.5 - Math.cos(progress * Math.PI * 2) / 2;
}

function activityLabel(activity: GeoActivity) {
  return ACTIVITY_META[activity]?.label ?? activity;
}

function cleanCountryText(value: string | null | undefined) {
  return (value ?? "").replaceAll("\0", "").trim();
}

function pointLocationTitle(point: GeoPoint) {
  return point.city ?? point.regionName ?? point.countryCode ?? "Unknown location";
}

function pointLocationDetails(point: GeoPoint) {
  const region = [point.regionName, point.countryCode].filter(Boolean).join(", ");
  return [activityLabel(point.activity), region, point.routeTemplate ?? point.path ?? null].filter(
    (detail): detail is string => Boolean(detail),
  );
}

function mapDetailLevel(scale: number): MapDetailLevel {
  if (scale >= 2.35) return "labels";
  if (scale >= 1.55) return "borders";
  return "base";
}

function visibleCitySummaries(cities: GeoLocationSummary[], detailLevel: MapDetailLevel) {
  if (detailLevel === "labels") return cities.slice(0, 28);
  if (detailLevel === "borders") return cities.slice(0, 18);
  return cities.slice(0, 8);
}

function summarizeRealtimeLocations(points: LivePoint[]): GeoLocationSummary[] {
  const byLocation = new Map<
    string,
    {
      countryCode: string | null;
      regionCode: string | null;
      regionName: string | null;
      city: string | null;
      events: number;
      latitudeSum: number;
      longitudeSum: number;
      lastSeenAt: string;
    }
  >();

  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    const key = [point.countryCode ?? "", point.regionCode ?? "", point.regionName ?? "", point.city ?? ""].join("|");
    const current = byLocation.get(key);
    if (!current) {
      byLocation.set(key, {
        countryCode: point.countryCode,
        regionCode: point.regionCode,
        regionName: point.regionName,
        city: point.city,
        events: 1,
        latitudeSum: point.latitude,
        longitudeSum: point.longitude,
        lastSeenAt: point.occurredAt,
      });
      continue;
    }

    current.events += 1;
    current.latitudeSum += point.latitude;
    current.longitudeSum += point.longitude;
    if (new Date(point.occurredAt).getTime() > new Date(current.lastSeenAt).getTime()) {
      current.lastSeenAt = point.occurredAt;
    }
  }

  return Array.from(byLocation.values())
    .map((location) => ({
      countryCode: location.countryCode,
      regionCode: location.regionCode,
      regionName: location.regionName,
      city: location.city,
      latitude: location.latitudeSum / location.events,
      longitude: location.longitudeSum / location.events,
      events: location.events,
      clusters: location.events,
      lastSeenAt: location.lastSeenAt,
    }))
    .sort((a, b) => b.events - a.events || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
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

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function colorWithAlpha(color: string, alpha: number) {
  const hex = color.startsWith("#") ? color.slice(1) : color;
  if (hex.length !== 6) return `rgba(86, 216, 255, ${alpha})`;
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return `rgba(86, 216, 255, ${alpha})`;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawPulseWave(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  progress: number,
  opacity: number,
) {
  const easedProgress = easeOutCubic(progress);
  const radius = 24;
  const bandRadius = 6 + easedProgress * 15;
  const bandWidth = 4;
  const innerFade = Math.max(0, (bandRadius - bandWidth) / radius);
  const innerEdge = Math.max(0, (bandRadius - bandWidth * 0.42) / radius);
  const outerEdge = Math.min(1, (bandRadius + bandWidth * 0.42) / radius);
  const outerFade = Math.min(1, (bandRadius + bandWidth) / radius);
  const travelFade = 1 - easedProgress;
  const waveOpacity = (1 - progress) ** 1.35 * travelFade ** 0.9 * opacity;
  const transparentColor = colorWithAlpha(color, 0);
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, transparentColor);
  gradient.addColorStop(innerFade, transparentColor);
  gradient.addColorStop(innerEdge, color);
  gradient.addColorStop(outerEdge, color);
  gradient.addColorStop(outerFade, transparentColor);
  gradient.addColorStop(1, transparentColor);

  context.globalAlpha = waveOpacity * 0.92;
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function interpolateMapView(from: ViewTransform, to: ViewTransform, progress: number): ViewTransform {
  return {
    scale: from.scale + (to.scale - from.scale) * progress,
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function projectCoordinatesToScreen(
  longitude: number,
  latitude: number,
  projection: ReturnType<typeof geoNaturalEarth1>,
  view: ViewTransform,
  width: number,
  height: number,
) {
  const projected = projection([longitude, latitude]);
  if (!projected) return null;

  const [projectedX, projectedY] = projected;
  return {
    x: ((projectedX * view.scale + view.x) / MAP_WIDTH) * width,
    y: ((projectedY * view.scale + view.y) / MAP_HEIGHT) * height,
  };
}

function projectPointToScreen(
  point: GeoPoint,
  projection: ReturnType<typeof geoNaturalEarth1>,
  view: ViewTransform,
  width: number,
  height: number,
) {
  return projectCoordinatesToScreen(point.longitude, point.latitude, projection, view, width, height);
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

function createDevLocationPoint(latitude: number, longitude: number, accuracyMeters?: number): GeoPoint {
  return {
    id: "dev-local-location",
    occurredAt: new Date().toISOString(),
    eventType: "dev_location",
    activity: "page_view",
    latitude,
    longitude,
    accuracyRadiusKm: typeof accuracyMeters === "number" ? Math.max(1, Math.round(accuracyMeters / 1000)) : null,
    countryCode: null,
    regionCode: null,
    regionName: null,
    city: "Local Dev",
    path: null,
    routeTemplate: null,
    surface: "dashboard",
    elementKey: "dev-location",
    deviceClass: null,
    isBot: false,
  };
}

function useDevLocationPoint() {
  const [point, setPoint] = useState<GeoPoint | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof navigator === "undefined" || !navigator.geolocation) return;

    let active = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;
        setPoint(createDevLocationPoint(position.coords.latitude, position.coords.longitude, position.coords.accuracy));
      },
      () => {
        if (!active) return;
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (timeZone === "Europe/Vienna") setPoint(createDevLocationPoint(48.2082, 16.3738));
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 3_000 },
    );

    return () => {
      active = false;
    };
  }, []);

  return point;
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
              } catch {
                // Ignore malformed SSE payloads and keep the realtime stream alive.
              }
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
  hoveredCountry,
  loadError,
  isLoaded,
  outlinePath,
}: {
  borderPath: string;
  countryPaths: CountryPath[];
  detailLevel: MapDetailLevel;
  graticulePath: string;
  hoveredCountry: HoveredCountry | null;
  loadError: string | null;
  isLoaded: boolean;
  outlinePath: string;
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
        <path key={country.key} d={country.d} aria-label={country.name} fill="rgba(17, 124, 210, 0.052)" />
      ))}
      {hoveredCountry && <path d={hoveredCountry.d} fill="rgba(86, 216, 255, 0.14)" />}
      {outlinePath && (
        <path
          d={outlinePath}
          fill="none"
          stroke="#5ecbff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={detailLevel === "base" ? 0.46 : 0.4}
          strokeWidth={detailLevel === "base" ? 0.82 : 0.62}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {borderPath && (
        <path
          d={borderPath}
          fill="none"
          stroke="#5ecbff"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={detailLevel === "base" ? 0.46 : 0.4}
          strokeWidth={detailLevel === "base" ? 0.82 : 0.62}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  );
});

function drawCitySummaryPoint(
  context: CanvasRenderingContext2D,
  city: GeoLocationSummary,
  projection: ReturnType<typeof geoNaturalEarth1>,
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  now: number,
) {
  const screenPoint = projectCoordinatesToScreen(
    city.longitude,
    city.latitude,
    projection,
    view,
    canvasWidth,
    canvasHeight,
  );
  if (!screenPoint) return;
  const { x, y } = screenPoint;
  if (x < -24 || x > canvasWidth + 24 || y < -24 || y > canvasHeight + 24) return;

  const breath = idlePointBreath(now);
  const radius = IDLE_POINT_RADIUS + breath * 0.5;
  const color = "#2ad7ff";

  context.save();
  context.globalCompositeOperation = "lighter";
  context.globalAlpha = 0.16 + breath * 0.12;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.38 + breath * 0.18;
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawRealtimePoint(
  context: CanvasRenderingContext2D,
  point: LivePoint,
  projection: ReturnType<typeof geoNaturalEarth1>,
  view: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
  now: number,
) {
  const screenPoint = projectPointToScreen(point, projection, view, canvasWidth, canvasHeight);
  if (!screenPoint) return;
  const { x, y } = screenPoint;
  if (x < -32 || x > canvasWidth + 32 || y < -32 || y > canvasHeight + 32) return;

  const meta = ACTIVITY_META[point.activity] ?? ACTIVITY_META.interaction;
  const age = pointAge(point, now);
  const opacity = pointOpacity(point, now);
  const flashOpacity = point.persistent ? 0 : Math.max(0, 1 - age / FLASH_MS);
  const pulseActive = !point.persistent && age <= FLASH_MS + PULSE_MS;
  const pulseAge = Math.max(0, age - FLASH_MS * 0.35);
  const pulseRamp = Math.min(1, Math.max(0, pulseAge / 900));
  const breath = pulseActive ? 0 : idlePointBreath(now);
  const coreRadius = pulseActive ? LIVE_POINT_RADIUS : IDLE_POINT_RADIUS + breath * 0.5;
  const fillOpacity = (pulseActive ? 0.3 : 0.18 + breath * 0.16) * opacity;
  const strokeOpacity = (pulseActive ? 1 : 0.52 + breath * 0.26) * opacity;

  context.save();
  context.globalCompositeOperation = "lighter";

  if (flashOpacity > 0) {
    context.globalAlpha = flashOpacity * 0.28 * opacity;
    context.strokeStyle = meta.color;
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x, y, 9 + flashOpacity * 6, 0, Math.PI * 2);
    context.stroke();
  }

  if (pulseActive && pulseRamp > 0) {
    const progress = (pulseAge / PULSE_CYCLE_MS) % 1;
    drawPulseWave(context, x, y, meta.color, progress, opacity * pulseRamp);
  }

  context.shadowBlur = 0;
  context.globalAlpha = fillOpacity;
  context.fillStyle = meta.color;
  context.beginPath();
  context.arc(x, y, coreRadius, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = strokeOpacity;
  context.strokeStyle = meta.color;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, coreRadius, 0, Math.PI * 2);
  context.stroke();

  context.restore();
}

const RealtimePointCanvas = memo(function RealtimePointCanvas({
  cities,
  detailLevel,
  points,
  projection,
  viewRef,
}: {
  cities: GeoLocationSummary[];
  detailLevel: MapDetailLevel;
  points: LivePoint[];
  projection: ReturnType<typeof geoNaturalEarth1> | null;
  viewRef: { current: ViewTransform };
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const citiesRef = useRef(cities);
  const detailLevelRef = useRef(detailLevel);
  const pointsRef = useRef(points);
  const projectionRef = useRef(projection);

  useEffect(() => {
    citiesRef.current = cities;
  }, [cities]);

  useEffect(() => {
    detailLevelRef.current = detailLevel;
  }, [detailLevel]);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let animationFrame = 0;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const currentProjection = projectionRef.current;
      if (currentProjection) {
        const currentView = viewRef.current;
        const currentNow = Date.now();
        const currentCities = visibleCitySummaries(citiesRef.current, detailLevelRef.current);
        for (const city of currentCities) {
          drawCitySummaryPoint(context, city, currentProjection, currentView, width, height, currentNow);
        }

        const currentPoints = pointsRef.current;
        for (const point of currentPoints) {
          drawRealtimePoint(context, point, currentProjection, currentView, width, height, currentNow);
        }
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [viewRef]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />;
});

function RealtimeWorldMap({
  cities,
  points,
  resetSignal,
}: {
  cities: GeoLocationSummary[];
  points: LivePoint[];
  resetSignal: number;
}) {
  const initialViewRef = useRef<ViewTransform>(readPersistedMapView());
  const animationFrameRef = useRef<number | null>(null);
  const [detailLevel, setDetailLevel] = useState<MapDetailLevel>(() => mapDetailLevel(initialViewRef.current.scale));
  const [hoveredCountry, setHoveredCountry] = useState<HoveredCountry | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<number | null>(null);
  const hasResetSignalMountedRef = useRef(false);
  const hoverFrameRef = useRef<number | null>(null);
  const hoverPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
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
        feature: country,
        key:
          cleanCountryText(country.properties.isoA3) ||
          cleanCountryText(country.properties.isoA2) ||
          cleanCountryText(country.properties.name) ||
          `country-${index}`,
        name: cleanCountryText(country.properties.name),
      }))
      .filter((country): country is CountryPath => typeof country.d === "string");
  }, [mapGeometry, path]);
  const borderPath = useMemo(() => (mapGeometry && path ? (path(mapGeometry.borders) ?? "") : ""), [mapGeometry, path]);
  const outlinePath = useMemo(
    () => (mapGeometry && path ? (path(mapGeometry.outline) ?? "") : ""),
    [mapGeometry, path],
  );
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
      if (hoverFrameRef.current !== null) window.cancelAnimationFrame(hoverFrameRef.current);
      if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    applyTransform(viewRef.current);
  }, [applyTransform]);

  const scheduleMapHover = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!projection) return;
      hoverPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (hoverFrameRef.current !== null) return;

      hoverFrameRef.current = window.requestAnimationFrame(() => {
        hoverFrameRef.current = null;

        const pointer = hoverPointerRef.current;
        const svg = svgRef.current;
        const container = mapContainerRef.current;
        if (!pointer || !svg || !container || !projection.invert) return;

        const svgRect = svg.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const pointerX = pointer.clientX - svgRect.left;
        const pointerY = pointer.clientY - svgRect.top;
        const view = viewRef.current;
        const now = Date.now();
        let nearestPoint: { distance: number; point: LivePoint } | null = null;

        for (const point of points) {
          if (pointOpacity(point, now) <= 0) continue;
          const screenPoint = projectPointToScreen(point, projection, view, svgRect.width, svgRect.height);
          if (!screenPoint) continue;
          const distance = Math.hypot(pointerX - screenPoint.x, pointerY - screenPoint.y);
          if (distance <= 13 && (!nearestPoint || distance < nearestPoint.distance)) {
            nearestPoint = { distance, point };
          }
        }

        if (nearestPoint) {
          setHoveredCountry(null);
          setHoveredPoint({
            details: pointLocationDetails(nearestPoint.point),
            key: nearestPoint.point.id,
            title: pointLocationTitle(nearestPoint.point),
            x: Math.min(Math.max(pointer.clientX - containerRect.left + 14, 8), Math.max(8, containerRect.width - 220)),
            y: Math.min(Math.max(pointer.clientY - containerRect.top + 14, 8), Math.max(8, containerRect.height - 70)),
          });
          return;
        }

        setHoveredPoint(null);

        const rawX = ((pointer.clientX - svgRect.left) / svgRect.width) * MAP_WIDTH;
        const rawY = ((pointer.clientY - svgRect.top) / svgRect.height) * MAP_HEIGHT;
        const mapX = (rawX - view.x) / view.scale;
        const mapY = (rawY - view.y) / view.scale;
        const coordinates = projection.invert([mapX, mapY]);

        if (!coordinates) {
          setHoveredCountry(null);
          return;
        }

        const country = countryPaths.find((candidate) => geoContains(candidate.feature, coordinates));
        if (!country) {
          setHoveredCountry(null);
          return;
        }

        setHoveredCountry({
          d: country.d,
          key: country.key,
          name: country.name,
          x: Math.min(Math.max(pointer.clientX - containerRect.left + 14, 8), Math.max(8, containerRect.width - 180)),
          y: Math.min(Math.max(pointer.clientY - containerRect.top + 14, 8), Math.max(8, containerRect.height - 36)),
        });
      });
    },
    [countryPaths, points, projection],
  );

  const clearMapHover = useCallback(() => {
    hoverPointerRef.current = null;
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    setHoveredCountry(null);
    setHoveredPoint(null);
  }, []);

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

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      clearMapHover();
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
    },
    [clearMapHover],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        scheduleMapHover(event);
        return;
      }
      const currentView = viewRef.current;
      scheduleTransformUpdate({
        ...currentView,
        x: drag.originX + (event.clientX - drag.startX) * drag.unitsPerPixelX,
        y: drag.originY + (event.clientY - drag.startY) * drag.unitsPerPixelY,
      });
    },
    [scheduleMapHover, scheduleTransformUpdate],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        persistMapView(viewRef.current);
        scheduleMapHover(event);
      }
    },
    [scheduleMapHover],
  );

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
    <div
      ref={mapContainerRef}
      className="relative overflow-hidden rounded-lg border border-[#1e8cff66] bg-[#020a12] shadow-[0_0_36px_rgba(31,139,255,0.18)_inset]"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-[min(74vh,740px)] min-h-[520px] w-full touch-none select-none"
        role="img"
        aria-label="Realtime website activity world map"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerCancel={handlePointerUp}
        onPointerLeave={clearMapHover}
        onPointerUp={handlePointerUp}
      >
        <defs>
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
            hoveredCountry={hoveredCountry}
            loadError={mapLoadError}
            isLoaded={Boolean(mapGeometry)}
            outlinePath={outlinePath}
          />
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
      <RealtimePointCanvas
        cities={cities}
        detailLevel={detailLevel}
        points={points}
        projection={projection}
        viewRef={viewRef}
      />
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-[#56d8ff66] bg-[#03111bcc] px-2 py-1 font-mono text-[11px] leading-snug text-[#aeefff] shadow-[0_0_18px_rgba(86,216,255,0.2)]"
          style={{ left: hoveredPoint.x, top: hoveredPoint.y }}
        >
          <div className="text-[#d8f7ff]">{hoveredPoint.title}</div>
          {hoveredPoint.details.map((detail) => (
            <div key={detail} className="text-[#83ddffcc]">
              {detail}
            </div>
          ))}
        </div>
      )}
      {hoveredCountry && !hoveredPoint && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-[#56d8ff66] bg-[#03111bcc] px-2 py-1 font-mono text-[11px] text-[#aeefff] shadow-[0_0_18px_rgba(86,216,255,0.2)]"
          style={{ left: hoveredCountry.x, top: hoveredCountry.y }}
        >
          {hoveredCountry.name}
        </div>
      )}
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
  const devLocationPoint = useDevLocationPoint();
  const devLocationReceivedAtRef = useRef(Date.now() - FLASH_MS);
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
    mutationFn: () =>
      api.post<GeoIpUpdateResult>(ENDPOINTS.admin.analytics.website.geoIpUpdate, undefined, {
        timeoutMs: GEOIP_UPDATE_TIMEOUT_MS,
      }),
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

  const visiblePoints = useMemo(() => {
    const activePoints = points.filter((point) => pointOpacity(point, now) > 0);
    if (!devLocationPoint) return activePoints;
    return [{ ...devLocationPoint, persistent: true, receivedAt: devLocationReceivedAtRef.current }, ...activePoints];
  }, [devLocationPoint, now, points]);
  const realtimeLocations = useMemo(() => summarizeRealtimeLocations(visiblePoints), [visiblePoints]);
  const coverage = geoQuery.data?.coverage;
  const cities = geoQuery.data?.cities ?? [];
  const countries = geoQuery.data?.countries ?? [];
  const locationList = realtimeLocations.length > 0 ? realtimeLocations : cities;

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
              <RealtimeWorldMap cities={cities} points={visiblePoints} resetSignal={mapResetSignal} />
              <ActivityLegend />
            </DashboardSection.Body>
          </DashboardSection>

          <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
            <DashboardSection>
              <DashboardSection.Header icon={<MapPinIcon weight="duotone" className="size-4" />} title="Locations" />
              <DashboardSection.Body>
                <TopLocationList cities={locationList} />
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
