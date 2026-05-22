import { Background, Controls, type Edge, MiniMap, type Node, type NodeMouseHandler, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChartLineIcon,
  ClockCounterClockwiseIcon,
  DownloadIcon,
  FlowArrowIcon,
  FunnelIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PathIcon,
  PulseIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import type { DashboardLocale } from "@/i18n/messages";
import { formatNaturalText, getWebsiteAnalyticsCopy, type WebsiteCopy } from "./websiteAnalyticsText";

interface WebsiteAnalyticsSectionProps {
  data: WebsiteAnalyticsOverview | undefined;
  detail: WebsiteAnalyticsDrilldown | undefined;
  formatNumber: (value: number) => string;
  isExporting: boolean;
  isLoading: boolean;
  isRunningRetention: boolean;
  locale: DashboardLocale;
  onExport: () => void;
  onRunRetention: () => void;
  onSelectCluster: (clusterKey: string | null) => void;
  onSelectDevice: (deviceKey: string | null) => void;
  onSelectSession: (sessionId: string | null) => void;
  retentionResult: WebsiteAnalyticsRetentionResult | null;
  selectedClusterKey: string | null;
  selectedDeviceKey: string | null;
  selectedSessionId: string | null;
}

export interface WebsiteAnalyticsPathEvent {
  id: string;
  occurredAt: string;
  eventType: string;
  sessionId: string;
  deviceKey: string | null;
  clusterKey: string;
  cluster: string;
  confidence: string;
  path: string | null;
  routeTemplate: string | null;
  referrerDomain: string | null;
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
    clusterKey: string;
    cluster: string;
    confidence: string;
    devices: number;
    searches: number;
    lastSeenAt: string;
    topQuery: string | null;
  }>;
  referrers: Array<{
    referrerDomain: string;
    routeTemplate: string | null;
    pageviews: number;
    clusters: number;
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

export interface WebsiteAnalyticsDeviceSummary {
  deviceKey: string | null;
  label: string;
  sessions: number;
  events: number;
  lastSeenAt: string;
  deviceClass: string | null;
  browserFamily: string | null;
  osFamily: string | null;
}

export interface WebsiteAnalyticsSessionSummary {
  sessionId: string;
  deviceKey: string | null;
  clusterKey: string;
  cluster: string;
  events: number;
  pageviews: number;
  firstSeenAt: string;
  lastSeenAt: string;
  entryPath: string | null;
  exitPath: string | null;
}

export interface WebsiteAnalyticsDrilldown {
  filters: {
    clusterKey: string | null;
    deviceKey: string | null;
    sessionId: string | null;
  };
  devices: WebsiteAnalyticsDeviceSummary[];
  sessions: WebsiteAnalyticsSessionSummary[];
  events: WebsiteAnalyticsPathEvent[];
}

export interface WebsiteAnalyticsRetentionResult {
  policy: {
    rawEventsDays: number;
    summariesDays: number;
  };
  deletedEvents: number;
  deletedSessions: number;
  deletedSummaries: number;
}

export interface WebsiteAnalyticsExport {
  generatedAt: string;
  since: string;
  retentionPolicy: WebsiteAnalyticsRetentionResult["policy"];
  overview: WebsiteAnalyticsOverview;
  drilldown: WebsiteAnalyticsDrilldown;
}

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
  live_example_clicked: 370,
  ui_click: 370,
  player_started: 480,
  player_paused: 480,
  player_resumed: 480,
  player_completed: 480,
  player_unavailable: 480,
  listen_on_clicked: 590,
};

const TIME_FORMATTERS: Record<DashboardLocale, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }),
  en: new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }),
};

const DATE_TIME_FORMATTERS: Record<DashboardLocale, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  }),
  en: new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }),
};

const EMPTY_TOTALS: WebsiteAnalyticsOverview["totals"] = {
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

function WebsiteKpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] p-4 shadow-sm">
      <p className="min-w-0 truncate text-sm text-[var(--ds-text-subtle)]">{label}</p>
      <p className="text-right text-3xl font-semibold tabular-nums text-[var(--ds-text)]">{value}</p>
    </div>
  );
}

function EmptyState({ copy }: { copy: WebsiteCopy }) {
  return <p className="text-sm text-[var(--ds-text-subtle)]">{copy.noData}</p>;
}

function formatEventType(eventType: string, copy: WebsiteCopy) {
  return copy.eventLabels[eventType] ?? formatNaturalText(eventType, copy);
}

function formatTime(value: string, locale: DashboardLocale) {
  return TIME_FORMATTERS[locale].format(new Date(value));
}

function formatDateTime(value: string, locale: DashboardLocale) {
  return DATE_TIME_FORMATTERS[locale].format(new Date(value));
}

function formatConfidence(value: string, copy: WebsiteCopy) {
  return copy.confidenceLabels[value] ?? formatNaturalText(value, copy);
}

function formatSessionId(sessionId: string) {
  return sessionId.slice(0, 8);
}

function formatDeviceMeta(
  fields: Array<string | null | undefined>,
  copy: WebsiteCopy,
  options: { fallback?: string } = {},
) {
  const formatted = fields.flatMap((field) => (field ? [formatNaturalText(field, copy)] : []));
  return formatted.length > 0 ? formatted.join(" / ") : (options.fallback ?? "-");
}

function eventDetail(event: WebsiteAnalyticsPathEvent, copy: WebsiteCopy) {
  const detail = event.label ?? event.platform ?? event.surface ?? event.routeTemplate ?? event.path;
  return detail ? formatNaturalText(detail, copy) : formatEventType(event.eventType, copy);
}

function formatReferrer(value: string | null | undefined, copy: WebsiteCopy) {
  return value && value !== "direct" ? value : copy.directTraffic;
}

function formatRoute(value: string | null | undefined, copy: WebsiteCopy) {
  if (!value) return "-";
  return copy.routeLabels[value] ?? formatNaturalText(value, copy);
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
  const columns = useMemo<ColumnDef<WebsiteAnalyticsOverview["platforms"][number]>[]>(
    () => [
      {
        id: "platform",
        header: copy.columns.platform,
        cell: (row) => formatNaturalText(row.platform, copy),
        sortKey: (row) => formatNaturalText(row.platform, copy),
      },
      {
        id: "resolves",
        header: copy.columns.resolves,
        cell: (row) => <span className="tabular-nums">{formatNumber(row.resolves)}</span>,
        className: "text-right",
        sortKey: (row) => row.resolves,
      },
      {
        id: "share",
        header: copy.columns.share,
        cell: (row) => {
          const percentage = total > 0 ? Math.round((row.resolves / total) * 100) : 0;
          return (
            <div className="min-w-32">
              <span className="tabular-nums">{percentage}%</span>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--ds-section-header-bg)]">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        },
        className: "text-right",
        sortKey: (row) => (total > 0 ? row.resolves / total : 0),
      },
    ],
    [copy, formatNumber, total],
  );

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<FunnelIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.funnel}
      />
      <DashboardSection.Body flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.platform}
            defaultSort={{ id: "resolves", dir: "desc" }}
          />
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function HouseholdTable({
  copy,
  formatNumber,
  locale,
  onSelectCluster,
  rows,
  selectedClusterKey,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  locale: DashboardLocale;
  onSelectCluster: (clusterKey: string | null) => void;
  rows: WebsiteAnalyticsOverview["clusters"];
  selectedClusterKey: string | null;
}) {
  const columns = useMemo<ColumnDef<WebsiteAnalyticsOverview["clusters"][number]>[]>(
    () => [
      {
        id: "household",
        header: copy.columns.household,
        cell: (row) => (
          <button
            type="button"
            onClick={() => onSelectCluster(row.clusterKey === selectedClusterKey ? null : row.clusterKey)}
            className="min-w-0 text-left"
          >
            <span className="block font-mono text-[var(--ds-text)]">{row.cluster}</span>
            <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-muted)]">
              {copy.topQuery}: {row.topQuery ?? "-"}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-muted)]">
              {copy.lastSeen}: {row.lastSeenAt ? formatDateTime(row.lastSeenAt, locale) : "-"}
            </span>
          </button>
        ),
        sortKey: (row) => row.cluster,
      },
      {
        id: "confidence",
        header: copy.columns.confidence,
        cell: (row) => formatConfidence(row.confidence, copy),
        sortKey: (row) => row.confidence,
      },
      {
        id: "devices",
        header: copy.columns.devices,
        cell: (row) => <span className="tabular-nums">{formatNumber(row.devices)}</span>,
        className: "text-right",
        sortKey: (row) => row.devices,
      },
      {
        id: "searches",
        header: copy.columns.searches,
        cell: (row) => <span className="tabular-nums">{formatNumber(row.searches)}</span>,
        className: "text-right",
        sortKey: (row) => row.searches,
      },
    ],
    [copy, formatNumber, locale, onSelectCluster, selectedClusterKey],
  );

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<UsersThreeIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.households}
      />
      <DashboardSection.Body flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowClassName={(row) => (row.clusterKey === selectedClusterKey ? "bg-[var(--ds-nav-active-bg)]" : "")}
            getRowKey={(row) => row.clusterKey}
            defaultSort={{ id: "searches", dir: "desc" }}
          />
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function ReferrerTable({
  copy,
  formatNumber,
  rows,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  rows: WebsiteAnalyticsOverview["referrers"];
}) {
  const columns = useMemo<ColumnDef<WebsiteAnalyticsOverview["referrers"][number]>[]>(
    () => [
      {
        id: "source",
        header: copy.columns.sourceWebsite,
        cell: (row) => <span className="font-mono text-xs">{formatReferrer(row.referrerDomain, copy)}</span>,
        sortKey: (row) => row.referrerDomain,
      },
      {
        id: "route",
        header: copy.columns.route,
        cell: (row) => formatRoute(row.routeTemplate, copy),
        sortKey: (row) => formatRoute(row.routeTemplate, copy),
      },
      {
        id: "pageviews",
        header: copy.columns.pageviews,
        cell: (row) => <span className="tabular-nums">{formatNumber(row.pageviews)}</span>,
        className: "text-right",
        sortKey: (row) => row.pageviews,
      },
      {
        id: "clusters",
        header: copy.columns.clusters,
        cell: (row) => <span className="tabular-nums">{formatNumber(row.clusters)}</span>,
        className: "text-right",
        sortKey: (row) => row.clusters,
      },
    ],
    [copy, formatNumber],
  );

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<PathIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.referrers}
      />
      <DashboardSection.Body flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={(row) => `${row.routeTemplate ?? "unknown"}:${row.referrerDomain}`}
            defaultSort={{ id: "pageviews", dir: "desc" }}
          />
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function WebsiteActionButton({
  children,
  disabled,
  icon,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-2 rounded-control bg-[var(--ds-bg-elevated)] px-3 text-xs font-medium text-[var(--ds-text-subtle)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

function MaintenanceActions({
  copy,
  isExporting,
  isRunningRetention,
  onExport,
  onRunRetention,
  retentionResult,
}: {
  copy: WebsiteCopy;
  isExporting: boolean;
  isRunningRetention: boolean;
  onExport: () => void;
  onRunRetention: () => void;
  retentionResult: WebsiteAnalyticsRetentionResult | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <WebsiteActionButton
        disabled={isExporting}
        icon={<DownloadIcon weight="duotone" className="h-3.5 w-3.5" />}
        onClick={onExport}
      >
        {copy.exportJson}
      </WebsiteActionButton>
      <WebsiteActionButton
        disabled={isRunningRetention}
        icon={<TrashIcon weight="duotone" className="h-3.5 w-3.5" />}
        onClick={onRunRetention}
      >
        {copy.retention}
      </WebsiteActionButton>
      {retentionResult && (
        <span className="text-xs text-[var(--ds-text-muted)]">
          {copy.retentionDone}: {retentionResult.deletedEvents} / {retentionResult.deletedSessions} /{" "}
          {retentionResult.deletedSummaries}
        </span>
      )}
    </div>
  );
}

function DrilldownSection({
  copy,
  detail,
  formatNumber,
  locale,
  onSelectCluster,
  onSelectDevice,
  onSelectSession,
  selectedClusterKey,
  selectedDeviceKey,
  selectedSessionId,
}: {
  copy: WebsiteCopy;
  detail: WebsiteAnalyticsDrilldown | undefined;
  formatNumber: (value: number) => string;
  locale: DashboardLocale;
  onSelectCluster: (clusterKey: string | null) => void;
  onSelectDevice: (deviceKey: string | null) => void;
  onSelectSession: (sessionId: string | null) => void;
  selectedClusterKey: string | null;
  selectedDeviceKey: string | null;
  selectedSessionId: string | null;
}) {
  const hasSelection = Boolean(selectedClusterKey || selectedDeviceKey || selectedSessionId);
  const devices = detail?.devices ?? [];
  const sessions = detail?.sessions ?? [];
  const deviceColumns = useMemo<ColumnDef<WebsiteAnalyticsDeviceSummary>[]>(
    () => [
      {
        id: "device",
        header: copy.columns.devices,
        cell: (device) => (
          <button
            type="button"
            disabled={!device.deviceKey}
            onClick={() => onSelectDevice(device.deviceKey === selectedDeviceKey ? null : device.deviceKey)}
            className="min-w-0 text-left disabled:cursor-not-allowed disabled:opacity-70"
          >
            <span className="block font-mono text-xs text-[var(--ds-text)]">
              {copy.scopeLabels.device} {device.label}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-muted)]">
              {formatDeviceMeta([device.deviceClass, device.osFamily, device.browserFamily], copy)}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--ds-text-muted)]">
              {copy.lastSeen}: {formatDateTime(device.lastSeenAt, locale)}
            </span>
          </button>
        ),
        sortKey: (device) => device.label,
      },
      {
        id: "sessions",
        header: copy.columns.sessions,
        cell: (device) => <span className="tabular-nums">{formatNumber(device.sessions)}</span>,
        className: "text-right",
        sortKey: (device) => device.sessions,
      },
      {
        id: "events",
        header: copy.columns.events,
        cell: (device) => <span className="tabular-nums">{formatNumber(device.events)}</span>,
        className: "text-right",
        sortKey: (device) => device.events,
      },
    ],
    [copy, formatNumber, locale, onSelectDevice, selectedDeviceKey],
  );
  const sessionColumns = useMemo<ColumnDef<WebsiteAnalyticsSessionSummary>[]>(
    () => [
      {
        id: "session",
        header: copy.columns.sessions,
        cell: (session) => (
          <button
            type="button"
            onClick={() => onSelectSession(session.sessionId === selectedSessionId ? null : session.sessionId)}
            className="min-w-0 text-left"
          >
            <span className="block font-mono text-xs text-[var(--ds-text)]">
              {copy.scopeLabels.session} {formatSessionId(session.sessionId)}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-muted)]">
              {copy.columns.entry}: {session.entryPath ?? "-"}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-muted)]">
              {copy.columns.exit}: {session.exitPath ?? "-"}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--ds-text-muted)]">
              {copy.lastSeen}: {formatDateTime(session.lastSeenAt, locale)}
            </span>
          </button>
        ),
        sortKey: (session) => session.sessionId,
      },
      {
        id: "pageviews",
        header: copy.columns.pageviews,
        cell: (session) => <span className="tabular-nums">{formatNumber(session.pageviews)}</span>,
        className: "text-right",
        sortKey: (session) => session.pageviews,
      },
      {
        id: "events",
        header: copy.columns.events,
        cell: (session) => <span className="tabular-nums">{formatNumber(session.events)}</span>,
        className: "text-right",
        sortKey: (session) => session.events,
      },
    ],
    [copy, formatNumber, locale, onSelectSession, selectedSessionId],
  );

  const headerAddOn = useMemo(
    () =>
      hasSelection ? (
        <button
          type="button"
          onClick={() => onSelectCluster(null)}
          className="h-8 rounded-control bg-[var(--ds-bg-elevated)] px-3 text-xs font-medium text-[var(--ds-text-subtle)] hover:bg-[var(--ds-surface-hover)] hover:text-[var(--ds-text)]"
        >
          {copy.clearSelection}
        </button>
      ) : null,
    [copy.clearSelection, hasSelection, onSelectCluster],
  );

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
      <DashboardSection>
        <DashboardSection.Header
          icon={<ListBulletsIcon weight="duotone" className="h-4 w-4" />}
          title={copy.sections.deviceDrilldown}
          addOn={headerAddOn}
        />
        <DashboardSection.Body flush={devices.length > 0}>
          {devices.length === 0 ? (
            <EmptyState copy={copy} />
          ) : (
            <DataTable
              columns={deviceColumns}
              data={devices}
              getRowClassName={(device) =>
                device.deviceKey && device.deviceKey === selectedDeviceKey ? "bg-[var(--ds-nav-active-bg)]" : ""
              }
              getRowKey={(device) => device.deviceKey ?? "unknown"}
              defaultSort={{ id: "events", dir: "desc" }}
            />
          )}
        </DashboardSection.Body>
      </DashboardSection>

      <DashboardSection>
        <DashboardSection.Header
          icon={<ListBulletsIcon weight="duotone" className="h-4 w-4" />}
          title={copy.sections.sessionDrilldown}
          addOn={headerAddOn}
        />
        <DashboardSection.Body flush={sessions.length > 0}>
          {sessions.length === 0 ? (
            <EmptyState copy={copy} />
          ) : (
            <DataTable
              columns={sessionColumns}
              data={sessions}
              getRowClassName={(session) =>
                session.sessionId === selectedSessionId ? "bg-[var(--ds-nav-active-bg)]" : ""
              }
              getRowKey={(session) => session.sessionId}
              defaultSort={{ id: "events", dir: "desc" }}
            />
          )}
        </DashboardSection.Body>
      </DashboardSection>
    </div>
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
                <div className="truncate text-xs font-semibold">{formatEventType(event.eventType, copy)}</div>
                <div className="mt-1 truncate font-mono text-[10px] opacity-70">{eventDetail(event, copy)}</div>
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
    [copy, selectedEventId, visibleEvents],
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
                  <span className="min-w-0 truncate text-[var(--ds-text)]">{formatEventType(row.eventType, copy)}</span>
                  <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(row.count)}</span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[var(--ds-section-header-bg)]">
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
                  {formatEventType(event.eventType, copy)}
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
        [copy.inspectorLabels.event, formatEventType(event.eventType, copy)],
        [copy.inspectorLabels.cluster, event.cluster],
        [copy.inspectorLabels.confidence, formatConfidence(event.confidence, copy)],
        [copy.inspectorLabels.session, formatSessionId(event.sessionId)],
        [copy.inspectorLabels.surface, formatNaturalText(event.surface, copy)],
        [copy.inspectorLabels.platform, formatNaturalText(event.platform, copy)],
        [copy.inspectorLabels.route, formatRoute(event.routeTemplate ?? event.path, copy)],
        [copy.inspectorLabels.referrer, formatReferrer(event.referrerDomain, copy)],
        [copy.inspectorLabels.device, formatDeviceMeta([event.deviceClass, event.osFamily, event.browserFamily], copy)],
        [copy.inspectorLabels.detail, eventDetail(event, copy)],
        [copy.inspectorLabels.occurredAt, formatDateTime(event.occurredAt, locale)],
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

export function WebsiteAnalyticsSection({
  data,
  detail,
  formatNumber,
  isExporting,
  isLoading,
  isRunningRetention,
  locale,
  onExport,
  onRunRetention,
  onSelectCluster,
  onSelectDevice,
  onSelectSession,
  retentionResult,
  selectedClusterKey,
  selectedDeviceKey,
  selectedSessionId,
}: WebsiteAnalyticsSectionProps) {
  const copy = getWebsiteAnalyticsCopy(locale);
  const totals = data?.totals ?? EMPTY_TOTALS;
  const hasDrilldownSelection = Boolean(selectedClusterKey || selectedDeviceKey || selectedSessionId);
  const clickpathEvents = useMemo(
    () => (hasDrilldownSelection ? (detail?.events ?? []) : (data?.clickpath.events ?? [])),
    [data?.clickpath.events, detail?.events, hasDrilldownSelection],
  );
  const initialEvent = clickpathEvents[0] ?? data?.recentEvents[0];
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEvent?.id ?? null);
  const selectedEvent = useMemo(() => {
    const events = [...clickpathEvents, ...(data?.recentEvents ?? [])];
    return events.find((event) => event.id === selectedEventId) ?? initialEvent;
  }, [clickpathEvents, data, initialEvent, selectedEventId]);
  const handleSelectEvent = useCallback((event: WebsiteAnalyticsPathEvent) => {
    setSelectedEventId(event.id);
  }, []);
  const kpis = useMemo(
    () => [
      { label: copy.kpis.clusters, value: totals.clusters },
      { label: copy.kpis.devices, value: totals.devices },
      { label: copy.kpis.sessions, value: totals.sessions },
      { label: copy.kpis.pageviews, value: totals.pageviews },
      { label: copy.kpis.searches, value: totals.searches },
      { label: copy.kpis.resolves, value: totals.resolves },
      { label: copy.kpis.listenOn, value: totals.listenOn },
      { label: copy.kpis.interactions, value: totals.interactions },
      { label: copy.kpis.playerStarts, value: totals.playerStarts },
    ],
    [copy, totals],
  );
  const headerAddOn = useMemo(
    () => (
      <MaintenanceActions
        copy={copy}
        isExporting={isExporting}
        isRunningRetention={isRunningRetention}
        onExport={onExport}
        onRunRetention={onRunRetention}
        retentionResult={retentionResult}
      />
    ),
    [copy, isExporting, isRunningRetention, onExport, onRunRetention, retentionResult],
  );

  return (
    <div className="space-y-4">
      <DashboardSection>
        <DashboardSection.Header
          icon={<ChartLineIcon weight="duotone" className="h-4 w-4" />}
          title={copy.badge}
          addOn={headerAddOn}
        />
        <DashboardSection.Body>
          {isLoading && <p className="text-sm text-[var(--ds-text-subtle)]">{copy.loading}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {kpis.map((kpi) => (
              <WebsiteKpiCard key={kpi.label} label={kpi.label} value={formatNumber(kpi.value)} />
            ))}
          </div>
        </DashboardSection.Body>
      </DashboardSection>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <PlatformFunnel copy={copy} formatNumber={formatNumber} rows={data?.platforms ?? []} />
        <HouseholdTable
          copy={copy}
          formatNumber={formatNumber}
          locale={locale}
          onSelectCluster={onSelectCluster}
          rows={data?.clusters ?? []}
          selectedClusterKey={selectedClusterKey}
        />
      </div>

      <ReferrerTable copy={copy} formatNumber={formatNumber} rows={data?.referrers ?? []} />

      <DrilldownSection
        copy={copy}
        detail={detail}
        formatNumber={formatNumber}
        locale={locale}
        onSelectCluster={onSelectCluster}
        onSelectDevice={onSelectDevice}
        onSelectSession={onSelectSession}
        selectedClusterKey={selectedClusterKey}
        selectedDeviceKey={selectedDeviceKey}
        selectedSessionId={selectedSessionId}
      />

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <TopSearches copy={copy} formatNumber={formatNumber} rows={data?.searches ?? []} />
        <InteractionBreakdown copy={copy} formatNumber={formatNumber} rows={data?.interactions ?? []} />
      </div>

      <ClickpathFlow
        copy={copy}
        events={clickpathEvents}
        onSelectEvent={handleSelectEvent}
        selectedEventId={selectedEvent?.id ?? null}
      />

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
