import {
  ChartLineIcon,
  ClockCounterClockwiseIcon,
  DownloadIcon,
  FunnelIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PathIcon,
  PulseIcon,
  TrashIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useMemo } from "react";

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
  deviceModel: string | null;
  surface: string | null;
  platform: string | null;
  mediaType: string | null;
  shortId: string | null;
  elementKey: string | null;
  label: string | null;
  eventData: Record<string, unknown> | null;
  subject: {
    type: "track" | "album" | "artist";
    title: string;
    artist: string | null;
    artworkUrl: string | null;
  } | null;
}

interface WebsiteAnalyticsSubject {
  type: "track" | "album" | "artist";
  title: string;
  artist: string | null;
  artworkUrl: string | null;
}

interface WebsiteAnalyticsSearchDescriptor {
  label: string;
  queryType: string | null;
  platform: string | null;
  subject: WebsiteAnalyticsSubject | null;
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
  trends: Record<keyof WebsiteAnalyticsOverview["totals"], WebsiteAnalyticsTrend>;
  platforms: Array<{ platform: string; resolves: number }>;
  clusters: Array<{
    clusterKey: string;
    cluster: string;
    confidence: string;
    devices: number;
    searches: number;
    lastSeenAt: string;
    topQuery: WebsiteAnalyticsSearchDescriptor | null;
  }>;
  referrers: Array<{
    referrerDomain: string;
    routeTemplate: string | null;
    pageviews: number;
    clusters: number;
  }>;
  searchIntents: Array<{ intent: string; searches: number; clusters: number }>;
  interactions: Array<{
    eventType: string;
    label: string | null;
    surface: string | null;
    elementKey: string | null;
    platform: string | null;
    count: number;
  }>;
  searches: Array<WebsiteAnalyticsSearchDescriptor & { searches: number; clusters: number }>;
  recentEvents: WebsiteAnalyticsPathEvent[];
}

interface WebsiteAnalyticsTrend {
  change: number | null;
  status: "changed" | "new" | "none";
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
  deviceModel: string | null;
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

const TIME_FORMATTERS: Record<DashboardLocale, Intl.DateTimeFormat> = {
  de: new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }),
  en: new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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

const EMPTY_TRENDS: WebsiteAnalyticsOverview["trends"] = {
  clusters: { change: null, status: "none" },
  devices: { change: null, status: "none" },
  sessions: { change: null, status: "none" },
  pageviews: { change: null, status: "none" },
  searches: { change: null, status: "none" },
  resolves: { change: null, status: "none" },
  listenOn: { change: null, status: "none" },
  playerStarts: { change: null, status: "none" },
  interactions: { change: null, status: "none" },
};

function formatTrendValue(change: number): string {
  const abs = Math.abs(change);
  if (abs >= 100) return `${Math.round(abs)}%`;
  if (abs >= 10) return `${abs.toFixed(1)}%`;
  return `${abs.toFixed(2)}%`;
}

function WebsiteKpiCard({
  copy,
  label,
  trend,
  value,
}: {
  copy: WebsiteCopy;
  label: string;
  trend: WebsiteAnalyticsTrend;
  value: string;
}) {
  const trendText =
    trend.status === "new"
      ? copy.trendNew
      : trend.status === "changed" && trend.change !== null
        ? formatTrendValue(trend.change)
        : "—";
  const trendArrow =
    trend.status === "new"
      ? "↑"
      : trend.status === "changed" && trend.change !== null
        ? trend.change >= 0
          ? "↑"
          : "↓"
        : "→";
  const trendIsPositive =
    trend.status === "new" || (trend.status === "changed" && trend.change !== null && trend.change > 0);
  const trendIsNegative = trend.status === "changed" && trend.change !== null && trend.change < 0;
  const trendTone = trendIsPositive
    ? "bg-[var(--ds-badge-success-bg)] text-[var(--ds-badge-success-text)]"
    : trendIsNegative
      ? "bg-[var(--ds-badge-danger-bg)] text-[var(--ds-badge-danger-text)]"
      : "bg-[var(--ds-bg-elevated)] text-[var(--ds-text-subtle)]";

  return (
    <div
      className="min-w-0 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] px-4 py-2.5 shadow-sm"
      style={{ containerType: "inline-size" }}
    >
      <p className="mb-1 truncate text-sm text-[var(--ds-text-subtle)]">{label}</p>
      <div className="kpi-layout">
        <p className="kpi-value min-w-0 whitespace-nowrap text-2xl font-semibold text-[var(--ds-text)]">{value}</p>
        <p
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums ${trendTone}`}
        >
          <span aria-hidden="true">{trendArrow}</span>
          <span>{trendText}</span>
        </p>
      </div>
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

function formatDeviceSummaryLabel(device: WebsiteAnalyticsDeviceSummary, copy: WebsiteCopy) {
  return formatDeviceMeta([device.deviceModel, device.deviceClass, device.osFamily, device.browserFamily], copy, {
    fallback: device.label,
  });
}

function eventDataString(event: WebsiteAnalyticsPathEvent, key: string) {
  const value = event.eventData?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function eventSubjectDetail(event: WebsiteAnalyticsPathEvent) {
  if (!event.subject) return null;
  return event.subject.artist ? `${event.subject.title} - ${event.subject.artist}` : event.subject.title;
}

function formatSubject(subject: WebsiteAnalyticsSubject) {
  return subject.artist ? `${subject.title} - ${subject.artist}` : subject.title;
}

function formatSearchDescriptor(search: WebsiteAnalyticsSearchDescriptor | null | undefined, copy: WebsiteCopy) {
  if (!search) return "-";
  const platform = search.platform ? formatNaturalText(search.platform, copy) : null;
  const label = search.subject ? formatSubject(search.subject) : search.label;
  if (search.queryType === "url") {
    const readableLabel =
      label === "streaming_url_submitted" ? formatNaturalText("streaming_url_submitted", copy) : label;
    return platform ? `${platform} · ${readableLabel}` : readableLabel;
  }
  return label === "unknown" ? formatNaturalText("unknown", copy) : label;
}

function formatInteractionSummary(row: WebsiteAnalyticsOverview["interactions"][number], copy: WebsiteCopy) {
  if (row.eventType === "ui_click") {
    return formatNaturalText(row.elementKey ?? row.surface ?? row.label ?? row.eventType, copy);
  }

  const eventLabel = formatEventType(row.eventType, copy);
  if (row.eventType === "listen_on_clicked") {
    const service = extractListenOnService(row.platform ?? row.label);
    return service ? `${formatNaturalText(service, copy)} · ${eventLabel}` : eventLabel;
  }
  if (row.label && row.label !== row.eventType) {
    return `${eventLabel} · ${formatNaturalText(row.label, copy)}`;
  }
  return eventLabel;
}

function extractListenOnService(value: string | null | undefined) {
  const cleaned = value
    ?.trim()
    .replace(/^listen[\s_-]*on[\s:-]*/i, "")
    .trim();
  if (!cleaned || cleaned === "listen_on_clicked") return null;
  return cleaned;
}

function eventDetail(event: WebsiteAnalyticsPathEvent, copy: WebsiteCopy) {
  if (event.eventType === "search_submitted") {
    const queryType = eventDataString(event, "query_type");
    if (queryType === "url") {
      return formatSearchDescriptor(
        {
          label: eventDataString(event, "query_normalized") ?? "streaming_url_submitted",
          platform: event.platform,
          queryType,
          subject: event.subject,
        },
        copy,
      );
    }
    if (queryType === "genre") return eventDataString(event, "query_normalized") ?? formatNaturalText("genre", copy);
    return eventDataString(event, "query_normalized") ?? "-";
  }

  const label = event.label && event.label !== event.shortId ? event.label : null;
  if (event.eventType === "ui_click") {
    const action = event.elementKey ?? event.surface ?? label;
    return action ? formatNaturalText(action, copy) : formatEventType(event.eventType, copy);
  }

  if (
    (event.eventType === "popular_track_clicked" || event.eventType === "similar_artist_clicked") &&
    !label &&
    !event.subject &&
    !event.platform
  ) {
    return formatNaturalText("track_context_not_stored", copy);
  }

  const detail =
    eventSubjectDetail(event) ?? label ?? event.platform ?? event.surface ?? event.routeTemplate ?? event.path;
  return detail ? formatNaturalText(detail, copy) : formatEventType(event.eventType, copy);
}

function formatReferrer(value: string | null | undefined, copy: WebsiteCopy) {
  return value && value !== "direct" ? value : copy.directTraffic;
}

function formatRoute(value: string | null | undefined, copy: WebsiteCopy) {
  if (!value) return "-";
  return copy.routeLabels[value] ?? formatNaturalText(value, copy);
}

function formatSearchIntent(value: string, copy: WebsiteCopy) {
  if (value === "url") return formatNaturalText("streaming_url_submitted", copy);
  if (value === "text") return formatNaturalText("text_search_submitted", copy);
  if (value === "genre") return formatNaturalText("genre_search_submitted", copy);
  return formatNaturalText(value, copy);
}

function UsageOverview({
  copy,
  formatNumber,
  isLoading,
  kpis,
  headerAddOn,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  headerAddOn: ReactNode;
  isLoading: boolean;
  kpis: Array<{ label: string; trend: WebsiteAnalyticsTrend; value: number }>;
}) {
  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<ChartLineIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.overview}
        addOn={headerAddOn}
      />
      <DashboardSection.Body>
        {isLoading && <p className="text-sm text-[var(--ds-text-subtle)]">{copy.loading}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {kpis.map((kpi) => (
            <WebsiteKpiCard
              key={kpi.label}
              copy={copy}
              label={kpi.label}
              trend={kpi.trend}
              value={formatNumber(kpi.value)}
            />
          ))}
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
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

function SearchIntentTable({
  copy,
  formatNumber,
  rows,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
  rows: WebsiteAnalyticsOverview["searchIntents"];
}) {
  const columns = useMemo<ColumnDef<WebsiteAnalyticsOverview["searchIntents"][number]>[]>(
    () => [
      {
        id: "intent",
        header: copy.columns.intent,
        cell: (row) => formatSearchIntent(row.intent, copy),
        sortKey: (row) => formatSearchIntent(row.intent, copy),
      },
      {
        id: "searches",
        header: copy.columns.searches,
        cell: (row) => <span className="tabular-nums">{formatNumber(row.searches)}</span>,
        className: "text-right",
        sortKey: (row) => row.searches,
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
        icon={<MagnifyingGlassIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.searchIntents}
      />
      <DashboardSection.Body flush={rows.length > 0}>
        {rows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            getRowKey={(row) => row.intent}
            defaultSort={{ id: "searches", dir: "desc" }}
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
              {copy.topQuery}: {formatSearchDescriptor(row.topQuery, copy)}
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
            <span className="block truncate text-sm font-medium text-[var(--ds-text)]">
              {formatDeviceSummaryLabel(device, copy)}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--ds-text-muted)]">
              {copy.lastSeen}: {formatDateTime(device.lastSeenAt, locale)}
            </span>
          </button>
        ),
        sortKey: (device) => formatDeviceSummaryLabel(device, copy),
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
                key={`${row.queryType ?? "unknown"}:${row.platform ?? "none"}:${row.label}`}
                className="grid grid-cols-[1fr_auto_auto] gap-3 rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-[var(--ds-text)]">{formatSearchDescriptor(row, copy)}</span>
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
  const eventOrder = [
    "live_example_clicked",
    "layered_footer_clicked",
    "info_page_clicked",
    "help_page_clicked",
    "listen_on_clicked",
    "player_started",
    "player_paused",
    "player_resumed",
    "player_completed",
    "player_unavailable",
    "popular_track_clicked",
    "similar_artist_clicked",
    "upcoming_event_clicked",
    "ui_click",
  ];
  const sortedRows = rows.slice().sort((a, b) => {
    const aIndex = eventOrder.indexOf(a.eventType);
    const bIndex = eventOrder.indexOf(b.eventType);
    if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    return b.count - a.count || a.eventType.localeCompare(b.eventType);
  });
  const maxCount = Math.max(1, ...sortedRows.map((row) => row.count));

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<PulseIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.interactions}
      />
      <DashboardSection.Body>
        {sortedRows.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <div className="space-y-3">
            {sortedRows.map((row) => {
              const percentage = Math.round((row.count / maxCount) * 100);
              const label = formatInteractionSummary(row, copy);
              return (
                <div
                  key={`${row.eventType}:${row.elementKey ?? row.surface ?? row.platform ?? row.label ?? "none"}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-[var(--ds-text)]">{label}</span>
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

function SelectionEventsTable({
  copy,
  events,
  locale,
  showHint,
}: {
  copy: WebsiteCopy;
  events: WebsiteAnalyticsPathEvent[];
  locale: DashboardLocale;
  showHint: boolean;
}) {
  const columns = useMemo<ColumnDef<WebsiteAnalyticsPathEvent>[]>(
    () => [
      {
        id: "occurredAt",
        header: copy.columns.occurredAt,
        cell: (event) => formatTime(event.occurredAt, locale),
        sortKey: (event) => event.occurredAt,
      },
      {
        id: "event",
        header: copy.inspectorLabels.event,
        cell: (event) => formatEventType(event.eventType, copy),
        sortKey: (event) => formatEventType(event.eventType, copy),
      },
      {
        id: "detail",
        header: copy.columns.detail,
        cell: (event) => eventDetail(event, copy),
        sortKey: (event) => eventDetail(event, copy),
      },
      {
        id: "household",
        header: copy.columns.household,
        cell: (event) => <span className="font-mono text-xs">{event.cluster}</span>,
        sortKey: (event) => event.cluster,
      },
      {
        id: "device",
        header: copy.inspectorLabels.device,
        cell: (event) =>
          formatDeviceMeta([event.deviceModel, event.deviceClass, event.osFamily, event.browserFamily], copy),
        sortKey: (event) =>
          formatDeviceMeta([event.deviceModel, event.deviceClass, event.osFamily, event.browserFamily], copy),
      },
    ],
    [copy, locale],
  );

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<ClockCounterClockwiseIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.selectionEvents}
      />
      <DashboardSection.Body flush={events.length > 0}>
        {showHint ? (
          <p className="text-sm text-[var(--ds-text-subtle)]">{copy.selectEventsHint}</p>
        ) : events.length === 0 ? (
          <EmptyState copy={copy} />
        ) : (
          <DataTable columns={columns} data={events} getRowKey={(event) => event.id} />
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
  const trends = data?.trends ?? EMPTY_TRENDS;
  const hasSelection = Boolean(selectedClusterKey || selectedDeviceKey || selectedSessionId);
  const kpis = useMemo(
    () => [
      { label: copy.kpis.clusters, trend: trends.clusters, value: totals.clusters },
      { label: copy.kpis.devices, trend: trends.devices, value: totals.devices },
      { label: copy.kpis.sessions, trend: trends.sessions, value: totals.sessions },
      { label: copy.kpis.pageviews, trend: trends.pageviews, value: totals.pageviews },
      { label: copy.kpis.searches, trend: trends.searches, value: totals.searches },
      { label: copy.kpis.resolves, trend: trends.resolves, value: totals.resolves },
      { label: copy.kpis.listenOn, trend: trends.listenOn, value: totals.listenOn },
      { label: copy.kpis.interactions, trend: trends.interactions, value: totals.interactions },
      { label: copy.kpis.playerStarts, trend: trends.playerStarts, value: totals.playerStarts },
    ],
    [copy, totals, trends],
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
      <UsageOverview
        copy={copy}
        formatNumber={formatNumber}
        headerAddOn={headerAddOn}
        isLoading={isLoading}
        kpis={kpis}
      />

      <ReferrerTable copy={copy} formatNumber={formatNumber} rows={data?.referrers ?? []} />

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <SearchIntentTable copy={copy} formatNumber={formatNumber} rows={data?.searchIntents ?? []} />
        <PlatformFunnel copy={copy} formatNumber={formatNumber} rows={data?.platforms ?? []} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <TopSearches copy={copy} formatNumber={formatNumber} rows={data?.searches ?? []} />
        <InteractionBreakdown copy={copy} formatNumber={formatNumber} rows={data?.interactions ?? []} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
        <HouseholdTable
          copy={copy}
          formatNumber={formatNumber}
          locale={locale}
          onSelectCluster={onSelectCluster}
          rows={data?.clusters ?? []}
          selectedClusterKey={selectedClusterKey}
        />
        <SelectionEventsTable
          copy={copy}
          events={hasSelection ? (detail?.events ?? []) : []}
          locale={locale}
          showHint={!hasSelection}
        />
      </div>

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
    </div>
  );
}
