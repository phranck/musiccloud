import {
  ChartLineIcon,
  ClockCounterClockwiseIcon,
  CursorClickIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import type { DashboardLocale } from "@/i18n/messages";

interface WebsiteAnalyticsSectionProps {
  data: WebsiteAnalyticsOverview | undefined;
  formatNumber: (value: number) => string;
  isLoading: boolean;
  locale: DashboardLocale;
}

export interface WebsiteAnalyticsOverview {
  totals: {
    clusters: number;
    devices: number;
    sessions: number;
    searches: number;
    resolves: number;
    listenOn: number;
  };
  platforms: Array<{ platform: string; resolves: number }>;
  clusters: Array<{ cluster: string; confidence: string; devices: number; searches: number }>;
  heatmap: Array<{ x: number; y: number; count: number; elementKey: string | null; surface: string | null }>;
  recentEvents: Array<{
    occurredAt: string;
    eventType: string;
    cluster: string;
    surface: string | null;
    platform: string | null;
  }>;
}

interface WebsiteCopy {
  badge: string;
  note: string;
  kpis: {
    clusters: string;
    devices: string;
    sessions: string;
    searches: string;
    resolves: string;
    listenOn: string;
  };
  sections: {
    funnel: string;
    households: string;
    heatmap: string;
    clickpath: string;
    inspector: string;
  };
  columns: {
    platform: string;
    resolves: string;
    share: string;
    household: string;
    confidence: string;
    devices: string;
    searches: string;
  };
  heatmapHint: string;
  pathHint: string;
}

const COPY: Record<DashboardLocale, WebsiteCopy> = {
  de: {
    badge: "Neue musiccloud-Auswertung",
    note: "Echte first-party Website-Analytics aus den neuen Postgres-Tabellen. Die Werte zeigen Network Cluster, Ger\u00e4te und Sessions, keine echten User.",
    kpis: {
      clusters: "Network Cluster",
      devices: "Ger\u00e4te",
      sessions: "Sessions",
      searches: "Suchen",
      resolves: "Resolves",
      listenOn: "Listen-On Klicks",
    },
    sections: {
      funnel: "Resolve Funnel nach Plattform",
      households: "Gesch\u00e4tzte Haushalte",
      heatmap: "Klick-Heatmap je Seite",
      clickpath: "Clickpath Flow",
      inspector: "Node-Inspector",
    },
    columns: {
      platform: "Plattform",
      resolves: "Resolves",
      share: "Anteil",
      household: "Cluster",
      confidence: "Confidence",
      devices: "Ger\u00e4te",
      searches: "Suchen",
    },
    heatmapHint: "Relative Klickkoordinaten und semantische Targets, keine DOM-Snapshots und keine Formularinhalte.",
    pathHint: "Ein Flow verbindet Session, Suche, Resolve, Content-Klicks, Player und Outbound-Aktionen.",
  },
  en: {
    badge: "New musiccloud reporting",
    note: "Real first-party website analytics from the new Postgres tables. Values show network clusters, devices and sessions, not real users.",
    kpis: {
      clusters: "Network Clusters",
      devices: "Devices",
      sessions: "Sessions",
      searches: "Searches",
      resolves: "Resolves",
      listenOn: "Listen-On Clicks",
    },
    sections: {
      funnel: "Resolve Funnel by Platform",
      households: "Estimated Households",
      heatmap: "Click Heatmap per Page",
      clickpath: "Clickpath Flow",
      inspector: "Node Inspector",
    },
    columns: {
      platform: "Platform",
      resolves: "Resolves",
      share: "Share",
      household: "Cluster",
      confidence: "Confidence",
      devices: "Devices",
      searches: "Searches",
    },
    heatmapHint: "Relative click coordinates and semantic targets, no DOM snapshots and no form contents.",
    pathHint: "A flow connects session, search, resolve, content clicks, player usage and outbound actions.",
  },
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
          <EmptyState />
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
  rows,
}: {
  copy: WebsiteCopy;
  formatNumber: (value: number) => string;
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
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.cluster} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm">
                <span className="font-mono text-[var(--ds-text)]">{row.cluster}</span>
                <span className="text-right tabular-nums text-[var(--ds-text-subtle)]">{row.confidence}</span>
                <span className="text-right tabular-nums text-[var(--ds-text)]">{row.devices}</span>
                <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(row.searches)}</span>
              </div>
            ))}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function EmptyState() {
  return <p className="text-sm text-[var(--ds-text-subtle)]">Noch keine Daten im gewählten Zeitraum.</p>;
}

function HeatmapPreview({ copy, points }: { copy: WebsiteCopy; points: WebsiteAnalyticsOverview["heatmap"] }) {
  return (
    <DashboardSection className="min-h-full">
      <DashboardSection.Header
        icon={<CursorClickIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.heatmap}
      />
      <DashboardSection.Body>
        <div className="relative h-72 overflow-hidden rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]">
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
          {points.map((point) => (
            <span
              key={`${point.x}-${point.y}-${point.elementKey ?? ""}`}
              className="absolute h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/45 blur-xl"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            />
          ))}
          <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface)]/90 px-3 py-2 text-sm text-[var(--ds-text-subtle)] backdrop-blur">
            {copy.heatmapHint}
          </div>
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function RecentEventPath({ copy, events }: { copy: WebsiteCopy; events: WebsiteAnalyticsOverview["recentEvents"] }) {
  return (
    <DashboardSection className="min-h-full">
      <DashboardSection.Header
        icon={<ClockCounterClockwiseIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.clickpath}
      />
      <DashboardSection.Body>
        {events.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={`${event.occurredAt}-${event.eventType}-${event.cluster}`}
                className="grid grid-cols-[96px_1fr_auto] gap-3 rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2 text-sm"
              >
                <span className="tabular-nums text-[var(--ds-text-subtle)]">
                  {new Date(event.occurredAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="min-w-0 truncate font-mono text-xs text-[var(--ds-text)]">{event.eventType}</span>
                <span className="font-mono text-xs text-[var(--ds-text-subtle)]">{event.cluster}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-sm text-[var(--ds-text-subtle)]">{copy.pathHint}</p>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function NodeInspector({
  copy,
  event,
}: {
  copy: WebsiteCopy;
  event: WebsiteAnalyticsOverview["recentEvents"][number] | undefined;
}) {
  const rows = event
    ? [
        ["event_type", event.eventType],
        ["network_cluster", event.cluster],
        ["surface", event.surface ?? "-"],
        ["platform", event.platform ?? "-"],
        ["occurred_at", new Date(event.occurredAt).toLocaleString()],
      ]
    : [];
  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<MagnifyingGlassIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.inspector}
      />
      <DashboardSection.Body>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-2 text-sm">
            {rows.map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[140px_1fr] gap-3 rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2"
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
    searches: 0,
    resolves: 0,
    listenOn: 0,
  };
  const kpis = useMemo(
    () => [
      { label: copy.kpis.clusters, value: totals.clusters, sub: "network_cluster_key" },
      { label: copy.kpis.devices, value: totals.devices, sub: "device_key" },
      { label: copy.kpis.sessions, value: totals.sessions, sub: "session_id" },
      { label: copy.kpis.searches, value: totals.searches, sub: "search_submitted" },
      { label: copy.kpis.resolves, value: totals.resolves, sub: "resolve_succeeded" },
      { label: copy.kpis.listenOn, value: totals.listenOn, sub: "listen_on_clicked" },
    ],
    [copy, totals],
  );

  return (
    <div className="space-y-4">
      <DashboardSection>
        <DashboardSection.Header icon={<ChartLineIcon weight="duotone" className="h-4 w-4" />} title={copy.badge} />
        <DashboardSection.Body>
          <p className="max-w-3xl text-sm text-[var(--ds-text-subtle)]">{copy.note}</p>
          {isLoading && <p className="text-sm text-[var(--ds-text-subtle)]">Loading...</p>}
        </DashboardSection.Body>
      </DashboardSection>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <WebsiteKpiCard key={kpi.label} label={kpi.label} sub={kpi.sub} value={formatNumber(kpi.value)} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PlatformFunnel copy={copy} formatNumber={formatNumber} rows={data?.platforms ?? []} />
        <HouseholdTable copy={copy} formatNumber={formatNumber} rows={data?.clusters ?? []} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <HeatmapPreview copy={copy} points={data?.heatmap ?? []} />
        <RecentEventPath copy={copy} events={data?.recentEvents ?? []} />
      </div>

      <NodeInspector copy={copy} event={data?.recentEvents[0]} />
    </div>
  );
}
