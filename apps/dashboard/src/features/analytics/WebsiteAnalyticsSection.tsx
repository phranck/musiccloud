import { ChartLineIcon, FunnelIcon, MagnifyingGlassIcon, PathIcon, PulseIcon } from "@phosphor-icons/react";
import { type ReactNode, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaAndroid,
  FaApple,
  FaChrome,
  FaDesktop,
  FaEdge,
  FaFirefoxBrowser,
  FaGlobe,
  FaLaptop,
  FaLinux,
  FaMobileScreenButton,
  FaOpera,
  FaSafari,
  FaTabletScreenButton,
  FaWindows,
} from "react-icons/fa6";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import type { DashboardLocale } from "@/i18n/messages";
import { formatNaturalText, getWebsiteAnalyticsCopy, type WebsiteCopy } from "./websiteAnalyticsText";

interface WebsiteAnalyticsSectionProps {
  data: WebsiteAnalyticsOverview | undefined;
  environmentStorageKey: string;
  formatNumber: (value: number) => string;
  isLoading: boolean;
  locale: DashboardLocale;
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

type WebsiteAnalyticsEnvironmentType = "browser" | "os" | "device";

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
  environment: {
    browsers: WebsiteAnalyticsEnvironmentRow[];
    os: WebsiteAnalyticsEnvironmentRow[];
    devices: WebsiteAnalyticsEnvironmentRow[];
  };
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

interface WebsiteAnalyticsEnvironmentRow {
  value: string;
  visitors: number;
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

const EMPTY_ENVIRONMENT: WebsiteAnalyticsOverview["environment"] = {
  browsers: [],
  os: [],
  devices: [],
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
      className="min-w-0 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)] px-4 py-3 shadow-sm"
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
    return service ? `${eventLabel}: ${formatNaturalText(service, copy)}` : eventLabel;
  }
  if ((row.eventType === "help_page_clicked" || row.eventType === "info_page_clicked") && row.label) {
    return `${eventLabel}: ${formatNaturalText(row.label, copy)}`;
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

function normalizeEnvironmentValue(value: string): string {
  return value.trim().toLowerCase();
}

function getBrowserIcon(value: string): IconType {
  const key = normalizeEnvironmentValue(value);
  if (key.includes("firefox") || key.includes("fxios")) return FaFirefoxBrowser;
  if (key.includes("chrome") || key.includes("crios") || key.includes("chromium")) return FaChrome;
  if (key.includes("safari") || key === "ios") return FaSafari;
  if (key.includes("edge")) return FaEdge;
  if (key.includes("opera")) return FaOpera;
  return FaGlobe;
}

function getOsIcon(value: string): IconType {
  const key = normalizeEnvironmentValue(value);
  if (key.includes("android")) return FaAndroid;
  if (key.includes("ios") || key.includes("mac")) return FaApple;
  if (key.includes("windows")) return FaWindows;
  if (key.includes("linux")) return FaLinux;
  return FaDesktop;
}

function getDeviceIcon(value: string): IconType {
  const key = normalizeEnvironmentValue(value);
  if (key.includes("mobile") || key.includes("phone")) return FaMobileScreenButton;
  if (key.includes("tablet")) return FaTabletScreenButton;
  if (key.includes("laptop") || key.includes("notebook")) return FaLaptop;
  return FaDesktop;
}

function getEnvironmentIcon(type: WebsiteAnalyticsEnvironmentType, value: string): IconType {
  if (type === "browser") return getBrowserIcon(value);
  if (type === "os") return getOsIcon(value);
  return getDeviceIcon(value);
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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

function EnvironmentOverview({
  copy,
  environment,
  formatNumber,
  storageKey,
}: {
  copy: WebsiteCopy;
  environment: WebsiteAnalyticsOverview["environment"];
  formatNumber: (value: number) => string;
  storageKey: string;
}) {
  const tabs = useMemo(
    () =>
      [
        { label: copy.environment.browser, value: "browser", columnLabel: copy.environment.browser },
        { label: copy.environment.os, value: "os", columnLabel: copy.environment.os },
        { label: copy.environment.devices, value: "device", columnLabel: copy.environment.device },
      ] as const,
    [copy],
  );
  const [activeType, setActiveType] = useState<WebsiteAnalyticsEnvironmentType>("os");
  const activeTab = tabs.find((tab) => tab.value === activeType) ?? tabs[1];
  const rows =
    activeType === "browser" ? environment.browsers : activeType === "os" ? environment.os : environment.devices;
  const total = rows.reduce((sum, row) => sum + row.visitors, 0);
  const tabOptions = useMemo(() => tabs.map((tab) => ({ value: tab.value, label: tab.label })), [tabs]);
  const headerAddOn = useMemo(
    () => <SegmentedControl value={activeType} onChange={setActiveType} storageKey={storageKey} options={tabOptions} />,
    [activeType, storageKey, tabOptions],
  );

  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<FaGlobe className="h-4 w-4" />}
        title={copy.sections.environment}
        addOn={headerAddOn}
      />
      <DashboardSection.Body>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-[var(--ds-border-subtle)] pb-2 text-sm font-medium text-[var(--ds-text-subtle)]">
          <span>{activeTab.columnLabel}</span>
          <span className="text-right">{copy.environment.visitors}</span>
          <span className="text-right">{copy.environment.percentColumn}</span>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--ds-text-subtle)]">{copy.noData}</p>
        ) : (
          <ul className="space-y-1.5 pt-2">
            {rows.map((row) => {
              const percentage = total > 0 ? Math.round((row.visitors / total) * 100) : 0;
              const EnvironmentIcon = getEnvironmentIcon(activeType, row.value);
              const label = formatNaturalText(row.value, copy);
              return (
                <li
                  key={`${activeType}-${row.value}`}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 py-0.5 text-base"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[var(--ds-text-muted)]" title={label}>
                    <EnvironmentIcon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                    <span className="truncate">{label}</span>
                  </span>
                  <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(row.visitors)}</span>
                  <span className="text-right tabular-nums text-[var(--ds-text-subtle)]">{percentage}%</span>
                </li>
              );
            })}
          </ul>
        )}
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

export function WebsiteAnalyticsSection({
  data,
  environmentStorageKey,
  formatNumber,
  isLoading,
  locale,
}: WebsiteAnalyticsSectionProps) {
  const copy = getWebsiteAnalyticsCopy(locale);
  const totals = data?.totals ?? EMPTY_TOTALS;
  const trends = data?.trends ?? EMPTY_TRENDS;
  const environment = data?.environment ?? EMPTY_ENVIRONMENT;
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
  return (
    <div className="space-y-4">
      <UsageOverview copy={copy} formatNumber={formatNumber} headerAddOn={null} isLoading={isLoading} kpis={kpis} />

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
        <EnvironmentOverview
          copy={copy}
          environment={environment}
          formatNumber={formatNumber}
          storageKey={environmentStorageKey}
        />
      </div>
    </div>
  );
}
