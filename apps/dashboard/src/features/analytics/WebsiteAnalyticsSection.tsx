import { Background, Controls, type Edge, MiniMap, type Node, type NodeMouseHandler, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChartLineIcon,
  ClockCounterClockwiseIcon,
  CursorClickIcon,
  FlowArrowIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PathIcon,
  PulseIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import type { DashboardLocale } from "@/i18n/messages";

interface WebsiteAnalyticsSectionProps {
  data: WebsiteAnalyticsOverview | undefined;
  formatNumber: (value: number) => string;
  isLoading: boolean;
  locale: DashboardLocale;
}

export interface WebsiteAnalyticsPathEvent {
  id: string;
  occurredAt: string;
  eventType: string;
  sessionId: string;
  cluster: string;
  confidence: string;
  path: string | null;
  routeTemplate: string | null;
  deviceClass: string | null;
  browserFamily: string | null;
  osFamily: string | null;
  surface: string | null;
  platform: string | null;
  mediaType: string | null;
  shortId: string | null;
  elementKey: string | null;
  label: string | null;
}

export interface WebsiteAnalyticsOverview {
  totals: {
    clusters: number;
    devices: number;
    sessions: number;
    pageviews: number;
    searches: number;
    resolves: number;
    listenOn: number;
    playerStarts: number;
    interactions: number;
  };
  platforms: Array<{ platform: string; resolves: number }>;
  clusters: Array<{
    cluster: string;
    confidence: string;
    devices: number;
    searches: number;
    lastSeenAt: string;
    topQuery: string | null;
  }>;
  heatmapRoutes: Array<{ routeTemplate: string; viewportBucket: string | null; clicks: number }>;
  heatmap: Array<{
    x: number;
    y: number;
    count: number;
    elementKey: string | null;
    surface: string | null;
    routeTemplate: string | null;
    viewportBucket: string | null;
  }>;
  interactions: Array<{ eventType: string; count: number }>;
  searches: Array<{ query: string; searches: number; clusters: number }>;
  recentEvents: WebsiteAnalyticsPathEvent[];
  clickpath: {
    cluster: string | null;
    confidence: string | null;
    events: WebsiteAnalyticsPathEvent[];
  };
}

interface WebsiteCopy {
  badge: string;
  note: string;
  loading: string;
  noData: string;
  allRoutes: string;
  topQuery: string;
  lastSeen: string;
  kpis: {
    clusters: string;
    devices: string;
    sessions: string;
    pageviews: string;
    searches: string;
    resolves: string;
    listenOn: string;
    interactions: string;
    playerStarts: string;
  };
  sections: {
    funnel: string;
    households: string;
    heatmap: string;
    clickpath: string;
    inspector: string;
    interactions: string;
    searches: string;
    timeline: string;
  };
  columns: {
    platform: string;
    resolves: string;
    share: string;
    household: string;
    confidence: string;
    devices: string;
    searches: string;
    query: string;
    event: string;
    count: string;
    clusters: string;
  };
  heatmapHint: string;
  pathHint: string;
}

const COPY: Record<DashboardLocale, WebsiteCopy> = {
  de: {
    badge: "First-party Website Analytics",
    note: "Echte Postgres-Daten aus der neuen Website-Analytics-Pipeline. Die Ansicht zeigt Network Cluster, Geraete und Sessions, keine echten User.",
    loading: "Lade echte Website-Analytics...",
    noData: "Noch keine Daten im gewaehlten Zeitraum.",
    allRoutes: "Alle Routen",
    topQuery: "Top-Suche",
    lastSeen: "Zuletzt",
    kpis: {
      clusters: "Network Cluster",
      devices: "Geraete",
      sessions: "Sessions",
      pageviews: "Pageviews",
      searches: "Suchen",
      resolves: "Resolves",
      listenOn: "Listen-On Klicks",
      interactions: "Interaktionen",
      playerStarts: "Player Starts",
    },
    sections: {
      funnel: "Resolve Funnel nach Plattform",
      households: "Geschaetzte Haushalte",
      heatmap: "Klick-Heatmap je Seite",
      clickpath: "Clickpath Flow",
      inspector: "Node-Inspector",
      interactions: "Interaktionen",
      searches: "Suchbegriffe",
      timeline: "Letzte Events",
    },
    columns: {
      platform: "Plattform",
      resolves: "Resolves",
      share: "Anteil",
      household: "Cluster",
      confidence: "Confidence",
      devices: "Geraete",
      searches: "Suchen",
      query: "Suchbegriff",
      event: "Event",
      count: "Anzahl",
      clusters: "Cluster",
    },
    heatmapHint:
      "Aggregierte relative Klickkoordinaten pro freigegebener Route. Es werden keine DOM-Snapshots oder Formularinhalte gespeichert.",
    pathHint:
      "Der Flow zeigt die echte Eventfolge des aktivsten Network Clusters im Zeitraum. Nodes sind anklickbar und fuellen den Inspector.",
  },
  en: {
    badge: "First-party Website Analytics",
    note: "Real Postgres data from the new website analytics pipeline. This view shows network clusters, devices and sessions, not real users.",
    loading: "Loading real website analytics...",
    noData: "No data in the selected period yet.",
    allRoutes: "All routes",
    topQuery: "Top query",
    lastSeen: "Last seen",
    kpis: {
      clusters: "Network Clusters",
      devices: "Devices",
      sessions: "Sessions",
      pageviews: "Pageviews",
      searches: "Searches",
      resolves: "Resolves",
      listenOn: "Listen-On Clicks",
      interactions: "Interactions",
      playerStarts: "Player Starts",
    },
    sections: {
      funnel: "Resolve Funnel by Platform",
      households: "Estimated Households",
      heatmap: "Click Heatmap per Page",
      clickpath: "Clickpath Flow",
      inspector: "Node Inspector",
      interactions: "Interactions",
      searches: "Search Terms",
      timeline: "Recent Events",
    },
    columns: {
      platform: "Platform",
      resolves: "Resolves",
      share: "Share",
      household: "Cluster",
      confidence: "Confidence",
      devices: "Devices",
      searches: "Searches",
      query: "Query",
      event: "Event",
      count: "Count",
      clusters: "Clusters",
    },
    heatmapHint:
      "Aggregated relative click coordinates per allowed route. DOM snapshots and form contents are not stored.",
    pathHint:
      "The flow shows the real event sequence for the most active network cluster in the period. Nodes are selectable and populate the inspector.",
  },
};

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page View",
  search_submitted: "Search",
  resolve_started: "Resolve Start",
  resolve_succeeded: "Resolve OK",
  resolve_failed: "Resolve Failed",
  listen_on_clicked: "Listen On",
  similar_artist_clicked: "Similar Artist",
  popular_track_clicked: "Popular Track",
  upcoming_event_clicked: "Upcoming Event",
  player_started: "Player Start",
  player_paused: "Player Pause",
  player_resumed: "Player Resume",
  player_completed: "Player Complete",
  player_unavailable: "Player Unavailable",
  info_page_clicked: "Info Page",
  help_page_clicked: "Help Page",
  ui_click: "UI Click",
};

const FLOW_LANES: Record<string, number> = {
  page_view: 40,
  search_submitted: 150,
  resolve_started: 260,
  resolve_succeeded: 260,
  resolve_failed: 260,
  popular_track_clicked: 370,
  similar_artist_clicked: 370,
  upcoming_event_clicked: 370,
  info_page_clicked: 370,
  help_page_clicked: 370,
  ui_click: 370,
  player_started: 480,
  player_paused: 480,
  player_resumed: 480,
  player_completed: 480,
  player_unavailable: 480,
  listen_on_clicked: 590,
};

function WebsiteKpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] px-4 py-3 shadow-sm">
      <p className="truncate text-sm text-[var(--ds-text-subtle)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--ds-text)]">{value}</p>
      <p className="mt-1 truncate text-xs text-[var(--ds-text-muted)]">{sub}</p>
    </div>
  );
}

function EmptyState({ copy }: { copy: WebsiteCopy }) {
  return <p className="text-sm text-[var(--ds-text-subtle)]">{copy.noData}</p>;
}

function formatEventType(eventType: string) {
  return EVENT_LABELS[eventType] ?? eventType.replaceAll("_", " ");
}

function formatTime(value: string, locale: DashboardLocale) {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string, locale: DashboardLocale) {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function eventDetail(event: WebsiteAnalyticsPathEvent) {
  return event.label ?? event.platform ?? event.surface ?? event.routeTemplate ?? event.path ?? event.eventType;
}

function PlatformFunnel({
  copy,
  formatNumber,
  rows,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  rows: WebsiteAnalyticsOverview["platforms"];
}) {
  const total = rows.reduce((sum, row) => sum + row.resolves, 0);

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<FunnelIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.funnel}
      />
      <DashboardSection.Body>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[var(--ds-border-subtle)] pb-2 text-sm font-medium text-[var(--ds-text-subtle)]">
          <span>{copy.columns.platform}</span>
          <span className="text-right">{copy.columns.resolves}</span>
          <span className="text-right">{copy.columns.share}</span>
        </div>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const percentage = total > 0 ? Math.round((row.resolves / total) * 100) : 0;
              return (
                <div key={row.platform} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                  <span className="min-w-0 truncate text-[var(--ds-text)]">{row.platform}</span>
                  <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(row.resolves)}</span>
                  <span className="w-12 text-right tabular-nums text-[var(--ds-text-subtle)]">{percentage}%</span>
                  <div className="col-span-3 h-1.5 overflow-hidden rounded-full bg-[var(--ds-bg-elevated)]">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function HouseholdTable({
  copy,
  formatNumber,
  locale,
  rows,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  locale: DashboardLocale;
  rows: WebsiteAnalyticsOverview["clusters"];
}) {
  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<UsersThreeIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.households}
      />
      <DashboardSection.Body>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-[var(--ds-border-subtle)] pb-2 text-sm font-medium text-[var(--ds-text-subtle)]">
          <span>{copy.columns.household}</span>
          <span className="text-right">{copy.columns.confidence}</span>
          <span className="text-right">{copy.columns.devices}</span>
          <span className="text-right">{copy.columns.searches}</span>
        </div>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.cluster} className="rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm">
                  <span className="font-mono text-[var(--ds-text)]">{row.cluster}</span>
                  <span className="text-right tabular-nums text-[var(--ds-text-subtle)]">{row.confidence}</span>
                  <span className="text-right tabular-nums text-[var(--ds-text)]">{row.devices}</span>
                  <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(row.searches)}</span>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-3 text-xs text-[var(--ds-text-muted)]">
                  <span className="min-w-0 truncate">
                    {copy.topQuery}: {row.topQuery ?? "-"}
                  </span>
                  <span className="text-right">
                    {copy.lastSeen}: {formatDateTime(row.lastSeenAt, locale)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function HeatmapPreview({
  copy,
  points,
  routes,
}: {
  copy: WebsiteCopy;
  points: WebsiteAnalyticsOverview["heatmap"];
  routes: WebsiteAnalyticsOverview["heatmapRoutes"];
}) {
  const [selectedRoute, setSelectedRoute] = useState("all");
  const filteredPoints = useMemo(
    () => points.filter((point) => selectedRoute === "all" || point.routeTemplate === selectedRoute),
    [points, selectedRoute],
  );

  return (
    <DashboardSection className="min-h-full">
      <DashboardSection.Header
        icon={<CursorClickIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.heatmap}
      />
      <DashboardSection.Body>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedRoute("all")}
            className={`h-8 rounded-control px-3 text-xs font-medium ${
              selectedRoute === "all"
                ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)]"
                : "bg-[var(--ds-bg-elevated)] text-[var(--ds-text-subtle)] hover:text-[var(--ds-text)]"
            }`}
          >
            {copy.allRoutes}
          </button>
          {routes.map((route) => (
            <button
              type="button"
              key={`${route.routeTemplate}-${route.viewportBucket ?? "all"}`}
              onClick={() => setSelectedRoute(route.routeTemplate)}
              className={`h-8 rounded-control px-3 text-xs font-medium ${
                selectedRoute === route.routeTemplate
                  ? "bg-[var(--ds-nav-active-bg)] text-[var(--ds-nav-active-text)]"
                  : "bg-[var(--ds-bg-elevated)] text-[var(--ds-text-subtle)] hover:text-[var(--ds-text)]"
              }`}
            >
              {route.routeTemplate} - {route.clicks}
            </button>
          ))}
        </div>
        <div className="relative h-80 overflow-hidden rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]">
          <div className="absolute inset-0 grid grid-cols-[1fr_1.35fr] gap-4 p-5 opacity-70">
            <div className="space-y-3">
              <div className="h-9 rounded-lg bg-[var(--ds-surface)]" />
              <div className="h-24 rounded-lg bg-[var(--ds-surface)]" />
              <div className="h-16 rounded-lg bg-[var(--ds-surface)]" />
            </div>
            <div className="space-y-3">
              <div className="h-16 rounded-lg bg-[var(--ds-surface)]" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-24 rounded-lg bg-[var(--ds-surface)]" />
                <div className="h-24 rounded-lg bg-[var(--ds-surface)]" />
              </div>
              <div className="h-12 rounded-lg bg-[var(--ds-surface)]" />
            </div>
          </div>
          {filteredPoints.map((point) => {
            const size = Math.min(110, 42 + point.count * 10);
            return (
              <span
                key={`${point.routeTemplate ?? ""}-${point.x}-${point.y}-${point.elementKey ?? ""}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/45 blur-xl"
                style={{ left: `${point.x}%`, top: `${point.y}%`, width: size, height: size }}
                title={point.elementKey ?? point.surface ?? undefined}
              />
            );
          })}
          {filteredPoints.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <EmptyState copy={copy} />
            </div>
          )}
          <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)]/90 px-3 py-2 text-sm text-[var(--ds-text-subtle)] backdrop-blur">
            {copy.heatmapHint}
          </div>
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function ClickpathFlow({
  copy,
  events,
  onSelectEvent,
  selectedEventId,
}: {
  copy: WebsiteCopy;
  events: WebsiteAnalyticsPathEvent[];
  onSelectEvent: (event: WebsiteAnalyticsPathEvent) => void;
  selectedEventId: string | null;
}) {
  const visibleEvents = useMemo(() => events.slice(0, 28), [events]);
  const nodes = useMemo<Node[]>(
    () =>
      visibleEvents.map((event, index) => {
        const selected = event.id === selectedEventId;
        return {
          id: event.id,
          position: { x: index * 188, y: FLOW_LANES[event.eventType] ?? 370 },
          data: {
            label: (
              <div className="min-w-36 max-w-44">
                <div className="truncate text-xs font-semibold">{formatEventType(event.eventType)}</div>
                <div className="mt-1 truncate font-mono text-[10px] opacity-70">{eventDetail(event)}</div>
              </div>
            ),
          },
          style: {
            borderRadius: 12,
            border: selected ? "1px solid rgb(34 211 238)" : "1px solid rgba(255,255,255,.16)",
            background: selected ? "rgba(8, 145, 178, .24)" : "var(--ds-surface)",
            color: "var(--ds-text)",
            boxShadow: selected ? "0 0 0 3px rgba(34,211,238,.15)" : "none",
            padding: 10,
          },
        };
      }),
    [selectedEventId, visibleEvents],
  );
  const edges = useMemo<Edge[]>(
    () =>
      visibleEvents.slice(1).map((event, index) => ({
        id: `${visibleEvents[index].id}-${event.id}`,
        source: visibleEvents[index].id,
        target: event.id,
        animated: true,
        style: { stroke: "rgb(34 211 238)", strokeWidth: 2 },
      })),
    [visibleEvents],
  );
  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      const pathEvent = visibleEvents.find((candidate) => candidate.id === node.id);
      if (pathEvent) onSelectEvent(pathEvent);
    },
    [onSelectEvent, visibleEvents],
  );

  return (
    <DashboardSection className="min-h-full">
      <DashboardSection.Header
        icon={<FlowArrowIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.clickpath}
      />
      <DashboardSection.Body>
        {visibleEvents.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <>
            <div className="h-[520px] overflow-hidden rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]">
              <ReactFlow
                colorMode="dark"
                edges={edges}
                fitView
                maxZoom={1.3}
                minZoom={0.18}
                nodes={nodes}
                nodesDraggable={false}
                onNodeClick={handleNodeClick}
                panOnScroll
              >
                <Background color="rgba(255,255,255,.12)" gap={24} />
                <MiniMap pannable zoomable nodeColor="rgb(34 211 238)" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
            <p className="text-sm text-[var(--ds-text-subtle)]">{copy.pathHint}</p>
          </>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function TopSearches({
  copy,
  formatNumber,
  rows,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  rows: WebsiteAnalyticsOverview["searches"];
}) {
  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<MagnifyingGlassIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.searches}
      />
      <DashboardSection.Body>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.query}
                className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-mono text-xs text-[var(--ds-text)]">{row.query}</span>
                <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(row.searches)}</span>
                <span className="text-right tabular-nums text-[var(--ds-text-subtle)]">
                  {formatNumber(row.clusters)} {copy.columns.clusters}
                </span>
              </div>
            ))}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function InteractionBreakdown({
  copy,
  formatNumber,
  rows,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  rows: WebsiteAnalyticsOverview["interactions"];
}) {
  const maxCount = Math.max(1, ...rows.map((row) => row.count));

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<PulseIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.interactions}
      />
      <DashboardSection.Body>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const percentage = Math.round((row.count / maxCount) * 100);
              return (
                <div key={row.eventType} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                  <span className="min-w-0 truncate text-[var(--ds-text)]">{formatEventType(row.eventType)}</span>
                  <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(row.count)}</span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[var(--ds-bg-elevated)]">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function RecentEventTimeline({
  copy,
  events,
  locale,
  onSelectEvent,
}: {
  copy: WebsiteCopy;
  events: WebsiteAnalyticsPathEvent[];
  locale: DashboardLocale;
  onSelectEvent: (event: WebsiteAnalyticsPathEvent) => void;
}) {
  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<ClockCounterClockwiseIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.timeline}
      />
      <DashboardSection.Body>
        {events.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => onSelectEvent(event)}
                className="grid w-full grid-cols-[74px_1fr_auto] gap-3 rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2 text-left text-sm hover:bg-[var(--ds-surface-hover)]"
              >
                <span className="tabular-nums text-[var(--ds-text-subtle)]">
                  {formatTime(event.occurredAt, locale)}
                </span>
                <span className="min-w-0 truncate font-mono text-xs text-[var(--ds-text)]">
                  {formatEventType(event.eventType)}
                </span>
                <span className="font-mono text-xs text-[var(--ds-text-subtle)]">{event.cluster}</span>
              </button>
            ))}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function NodeInspector({
  copy,
  event,
  locale,
}: {
  copy: WebsiteCopy;
  event: WebsiteAnalyticsPathEvent | undefined;
  locale: DashboardLocale;
}) {
  const rows = event
    ? [
        ["event_type", formatEventType(event.eventType)],
        ["network_cluster", event.cluster],
        ["confidence", event.confidence],
        ["session_id", event.sessionId],
        ["surface", event.surface ?? "-"],
        ["platform", event.platform ?? "-"],
        ["route", event.routeTemplate ?? event.path ?? "-"],
        ["device", [event.deviceClass, event.osFamily, event.browserFamily].filter(Boolean).join(" / ") || "-"],
        ["detail", eventDetail(event)],
        ["occurred_at", formatDateTime(event.occurredAt, locale)],
      ]
    : [];
  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<PathIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.inspector}
      />
      <DashboardSection.Body>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <div className="grid gap-2 text-sm lg:grid-cols-2">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[130px_1fr] gap-3 rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2"
              >
                <span className="font-mono text-xs text-[var(--ds-text-subtle)]">{label}</span>
                <span className="min-w-0 truncate font-mono text-xs text-[var(--ds-text)]">{value}</span>
              </div>
            ))}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

export function WebsiteAnalyticsSection({ data, formatNumber, isLoading, locale }: WebsiteAnalyticsSectionProps) {
  const copy = COPY[locale];
  const totals = data?.totals ?? {
    clusters: 0,
    devices: 0,
    sessions: 0,
    pageviews: 0,
    searches: 0,
    resolves: 0,
    listenOn: 0,
    playerStarts: 0,
    interactions: 0,
  };
  const initialEvent = data?.clickpath.events[0] ?? data?.recentEvents[0];
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEvent?.id ?? null);
  const selectedEvent = useMemo(() => {
    const events = [...(data?.clickpath.events ?? []), ...(data?.recentEvents ?? [])];
    return events.find((event) => event.id === selectedEventId) ?? initialEvent;
  }, [data, initialEvent, selectedEventId]);
  const handleSelectEvent = useCallback((event: WebsiteAnalyticsPathEvent) => {
    setSelectedEventId(event.id);
  }, []);
  const kpis = useMemo(
    () => [
      { label: copy.kpis.clusters, value: totals.clusters, sub: "network_cluster_key" },
      { label: copy.kpis.devices, value: totals.devices, sub: "device_key" },
      { label: copy.kpis.sessions, value: totals.sessions, sub: "session_id" },
      { label: copy.kpis.pageviews, value: totals.pageviews, sub: "page_view" },
      { label: copy.kpis.searches, value: totals.searches, sub: "search_submitted" },
      { label: copy.kpis.resolves, value: totals.resolves, sub: "resolve_succeeded" },
      { label: copy.kpis.listenOn, value: totals.listenOn, sub: "listen_on_clicked" },
      { label: copy.kpis.interactions, value: totals.interactions, sub: "tracked actions" },
      { label: copy.kpis.playerStarts, value: totals.playerStarts, sub: "player_started" },
    ],
    [copy, totals],
  );

  return (
    <div className="space-y-4">
      <DashboardSection>
        <DashboardSection.Header icon={<ChartLineIcon weight="duotone" className="h-4 w-4" />} title={copy.badge} />
        <DashboardSection.Body>
          <p className="max-w-3xl text-sm text-[var(--ds-text-subtle)]">{copy.note}</p>
          {isLoading && <p className="text-sm text-[var(--ds-text-subtle)]">{copy.loading}</p>}
        </DashboardSection.Body>
      </DashboardSection>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-9">
        {kpis.map((kpi) => (
          <WebsiteKpiCard key={kpi.label} label={kpi.label} sub={kpi.sub} value={formatNumber(kpi.value)} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PlatformFunnel copy={copy} formatNumber={formatNumber} rows={data?.platforms ?? []} />
        <HouseholdTable copy={copy} formatNumber={formatNumber} locale={locale} rows={data?.clusters ?? []} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]">
        <HeatmapPreview copy={copy} points={data?.heatmap ?? []} routes={data?.heatmapRoutes ?? []} />
        <div className="grid gap-3">
          <TopSearches copy={copy} formatNumber={formatNumber} rows={data?.searches ?? []} />
          <InteractionBreakdown copy={copy} formatNumber={formatNumber} rows={data?.interactions ?? []} />
        </div>
      </div>

      <ClickpathFlow
        copy={copy}
        events={data?.clickpath.events ?? []}
        onSelectEvent={handleSelectEvent}
        selectedEventId={selectedEvent?.id ?? null}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <RecentEventTimeline
          copy={copy}
          events={data?.recentEvents ?? []}
          locale={locale}
          onSelectEvent={handleSelectEvent}
        />
        <NodeInspector copy={copy} event={selectedEvent} locale={locale} />
      </div>
    </div>
  );
}
