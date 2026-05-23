import { ENDPOINTS } from "@musiccloud/shared";
import { CrosshairIcon, GlobeHemisphereWestIcon, MapPinIcon, PulseIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";

type GeoActivity = "page_view" | "search" | "resolve" | "listen" | "player" | "interaction" | "bot";

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
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 520;
const MAX_POINTS = 320;
const FLASH_MS = 1_800;
const PULSE_MS = 60_000;
const FADE_MS = 18_000;
const POINT_TTL_MS = FLASH_MS + PULSE_MS + FADE_MS;

const ACTIVITY_META: Record<GeoActivity, { color: string; label: string }> = {
  page_view: { color: "#56d8ff", label: "Page View" },
  search: { color: "#fff177", label: "Search" },
  resolve: { color: "#64ff9a", label: "Resolve" },
  listen: { color: "#ff6dcb", label: "Listen" },
  player: { color: "#ff9c5a", label: "Player" },
  interaction: { color: "#b79cff", label: "Interaction" },
  bot: { color: "#8a96a8", label: "Bot" },
};

const WORLD_REGIONS: Array<{ name: string; points: Array<[number, number]> }> = [
  {
    name: "north-america",
    points: [
      [-168, 72],
      [-140, 70],
      [-124, 58],
      [-128, 48],
      [-116, 32],
      [-104, 24],
      [-84, 18],
      [-62, 45],
      [-54, 58],
      [-74, 68],
      [-104, 72],
      [-138, 74],
      [-168, 72],
    ],
  },
  {
    name: "south-america",
    points: [
      [-82, 12],
      [-70, 8],
      [-54, -2],
      [-42, -18],
      [-50, -40],
      [-68, -55],
      [-76, -36],
      [-80, -12],
      [-82, 12],
    ],
  },
  {
    name: "eurasia",
    points: [
      [-10, 36],
      [8, 58],
      [44, 70],
      [92, 72],
      [142, 62],
      [170, 50],
      [150, 30],
      [118, 18],
      [82, 8],
      [44, 18],
      [28, 34],
      [10, 36],
      [-10, 36],
    ],
  },
  {
    name: "africa",
    points: [
      [-18, 34],
      [14, 36],
      [34, 22],
      [50, 4],
      [42, -24],
      [22, -36],
      [6, -28],
      [-12, -4],
      [-18, 18],
      [-18, 34],
    ],
  },
  {
    name: "australia",
    points: [
      [112, -12],
      [154, -20],
      [150, -38],
      [126, -42],
      [112, -30],
      [112, -12],
    ],
  },
  {
    name: "greenland",
    points: [
      [-52, 60],
      [-28, 70],
      [-40, 82],
      [-62, 76],
      [-72, 66],
      [-52, 60],
    ],
  },
];

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

function project(lon: number, lat: number) {
  return {
    x: ((lon + 180) / 360) * MAP_WIDTH,
    y: ((90 - lat) / 180) * MAP_HEIGHT,
  };
}

function toPolyline(points: Array<[number, number]>) {
  return points
    .map(([lon, lat]) => {
      const p = project(lon, lat);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
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

function buildGraticule(step: number) {
  const lines: Array<{ key: string; points: string }> = [];
  for (let lon = -180; lon <= 180; lon += step) {
    lines.push({ key: `lon-${lon}`, points: toPolyline([[lon, -80], [lon, 80]]) });
  }
  for (let lat = -60; lat <= 75; lat += step) {
    lines.push({ key: `lat-${lat}`, points: toPolyline([[-180, lat], [180, lat]]) });
  }
  return lines;
}

function RealtimeWorldMap({
  cities,
  points,
  now,
}: {
  cities: GeoLocationSummary[];
  points: LivePoint[];
  now: number;
}) {
  const [view, setView] = useState<ViewTransform>({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);
  const mapRef = useRef<SVGSVGElement | null>(null);
  const graticule = useMemo(() => buildGraticule(view.scale >= 2 ? 15 : 30), [view.scale]);
  const visibleCities = view.scale >= 1.85 ? cities.slice(0, 18) : cities.slice(0, 8);

  const handleWheel = useCallback((event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const nextScale = Math.min(5, Math.max(1, view.scale * (event.deltaY < 0 ? 1.16 : 0.86)));
    const ratio = nextScale / view.scale;
    setView({
      scale: nextScale,
      x: px - (px - view.x) * ratio,
      y: py - (py - view.y) * ratio,
    });
  }, [view]);

  const handlePointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
  }, [view.x, view.y]);

  const handlePointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }, []);

  const handlePointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#1e8cff66] bg-[#020a12] shadow-[0_0_36px_rgba(31,139,255,0.18)_inset]">
      <svg
        ref={mapRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-[min(68vh,620px)] min-h-[420px] w-full touch-none select-none"
        role="img"
        aria-label="Realtime website activity world map"
        onWheel={handleWheel}
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
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {graticule.map((line) => (
            <polyline
              key={line.key}
              points={line.points}
              fill="none"
              stroke="#1c86ff"
              strokeOpacity={view.scale >= 2 ? 0.22 : 0.14}
              strokeWidth={0.7 / view.scale}
            />
          ))}
          {WORLD_REGIONS.map((region) => (
            <polyline
              key={region.name}
              points={toPolyline(region.points)}
              fill="rgba(17, 124, 210, 0.045)"
              stroke="#5ecbff"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.82}
              strokeWidth={1.25 / view.scale}
              filter="url(#vfdGlow)"
            />
          ))}
          {visibleCities.map((city) => {
            const p = project(city.longitude, city.latitude);
            return (
              <g key={`${city.countryCode ?? "xx"}-${city.regionName ?? "region"}-${city.city ?? "city"}`}>
                <circle cx={p.x} cy={p.y} r={2.4 / Math.sqrt(view.scale)} fill="#2ad7ff" opacity={0.48} />
                {view.scale >= 2.35 && (
                  <text
                    x={p.x + 6 / view.scale}
                    y={p.y - 4 / view.scale}
                    fill="#83ddff"
                    fontSize={10 / view.scale}
                    opacity={0.72}
                  >
                    {city.city ?? city.regionName ?? city.countryCode ?? "Unknown"}
                  </text>
                )}
              </g>
            );
          })}
          {points.map((point) => {
            const p = project(point.longitude, point.latitude);
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
                    cx={p.x}
                    cy={p.y}
                    r={18 / Math.sqrt(view.scale)}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={1.4 / view.scale}
                    opacity={0.95}
                  />
                )}
                {pulse && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={(radius + 8) / Math.sqrt(view.scale)}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={0.8 / view.scale}
                    opacity={0.36}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={radius / Math.sqrt(view.scale)}
                  fill={meta.color}
                  stroke="#dff8ff"
                  strokeWidth={0.7 / view.scale}
                  filter="url(#vfdGlow)"
                />
              </g>
            );
          })}
        </g>
        <g opacity="0.78">
          <rect x="18" y="18" width="176" height="32" fill="rgba(2,10,18,0.72)" stroke="#1e8cff66" />
          <text x="32" y="39" fill="#72dcff" fontSize="14" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
            ZOOM {view.scale.toFixed(2)}X
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

export function WebsiteAnalyticsRealtimePage() {
  const { messages, formatNumber } = useI18n();
  const [points, setPoints] = useState<LivePoint[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const geoQuery = useQuery({
    queryKey: ["website-analytics-geo-realtime"],
    queryFn: () => api.get<GeoOverview>(`${ENDPOINTS.admin.analytics.website.geo}?period=today&realtimeMinutes=5&limit=250`),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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
                <div className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
                  <PulseIcon weight="duotone" className="size-4 text-[#64ff9a]" />
                  <span className="tabular-nums">{formatNumber(visiblePoints.length)}</span>
                </div>
              }
            />
            <DashboardSection.Body className="gap-3">
              <RealtimeWorldMap cities={cities} now={now} points={visiblePoints} />
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
      </PageBody>
    </PageLayout>
  );
}
