import {
  ChartLineIcon,
  CursorClickIcon,
  FlowArrowIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import type { UmamiPeriod } from "@/features/analytics/hooks/useUmamiStats";
import type { DashboardLocale } from "@/i18n/messages";

interface WebsiteAnalyticsSectionProps {
  formatNumber: (value: number) => string;
  locale: DashboardLocale;
  period: UmamiPeriod;
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
    note: "Preview der geplanten eigenen Datenfl\u00e4che. Die aktuelle Umami-Statistik bleibt ein eigener Sidebar-Eintrag; diese Ansicht wird sp\u00e4ter an die neuen Website-Analytics-Endpunkte angeschlossen.",
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
    note: "Preview of the planned first-party data surface. The current Umami statistics remain a separate sidebar entry; this view will later connect to the new Website Analytics endpoints.",
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

const PERIOD_FACTOR: Record<UmamiPeriod, number> = {
  today: 0.18,
  "7d": 1,
  "30d": 4.2,
  "60d": 7.8,
  "90d": 11.4,
};

const platformRows = [
  { platform: "Spotify", resolves: 128, color: "bg-emerald-400" },
  { platform: "Apple Music", resolves: 94, color: "bg-rose-400" },
  { platform: "YouTube", resolves: 71, color: "bg-red-400" },
  { platform: "Deezer", resolves: 38, color: "bg-sky-400" },
];

const householdRows = [
  { cluster: "#8f31", confidence: "0.72", devices: 3, searches: 14 },
  { cluster: "#2bc9", confidence: "0.64", devices: 2, searches: 9 },
  { cluster: "#a441", confidence: "0.58", devices: 1, searches: 7 },
  { cluster: "#61de", confidence: "0.51", devices: 4, searches: 6 },
];

const heatmapPoints = [
  { x: 24, y: 28, size: "h-20 w-20", tone: "bg-cyan-400/45" },
  { x: 59, y: 36, size: "h-28 w-28", tone: "bg-amber-300/45" },
  { x: 72, y: 55, size: "h-16 w-16", tone: "bg-emerald-300/45" },
  { x: 43, y: 70, size: "h-14 w-14", tone: "bg-sky-300/40" },
  { x: 82, y: 78, size: "h-12 w-12", tone: "bg-rose-300/40" },
];

const flowNodes = [
  { id: "cluster", label: "Cluster #8f31", sub: "3 devices", x: 38, y: 58, width: 142, lane: 1 },
  { id: "page", label: "Page View", sub: "/:shortId", x: 226, y: 58, width: 116, lane: 1 },
  { id: "search", label: "Search", sub: "radiohead", x: 392, y: 162, width: 112, lane: 2 },
  { id: "resolve", label: "Resolve", sub: "spotify", x: 564, y: 162, width: 112, lane: 2 },
  { id: "artist", label: "Popular Track", sub: "position 2", x: 740, y: 266, width: 142, lane: 3 },
  { id: "player", label: "Player", sub: "complete", x: 568, y: 368, width: 116, lane: 4 },
  { id: "listen", label: "Listen On", sub: "apple music", x: 838, y: 472, width: 132, lane: 5 },
];

function scale(value: number, factor: number): number {
  return Math.round(value * factor);
}

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
  factor,
  formatNumber,
}: {
  copy: WebsiteCopy;
  factor: number;
  formatNumber: (value: number) => string;
}) {
  const total = platformRows.reduce((sum, row) => sum + scale(row.resolves, factor), 0);

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
        <div className="space-y-3">
          {platformRows.map((row) => {
            const resolves = scale(row.resolves, factor);
            const percentage = total > 0 ? Math.round((resolves / total) * 100) : 0;
            return (
              <div key={row.platform} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                <span className="min-w-0 truncate text-[var(--ds-text)]">{row.platform}</span>
                <span className="text-right tabular-nums text-[var(--ds-text)]">{formatNumber(resolves)}</span>
                <span className="w-12 text-right tabular-nums text-[var(--ds-text-subtle)]">{percentage}%</span>
                <div className="col-span-3 h-1.5 overflow-hidden rounded-full bg-[var(--ds-bg-elevated)]">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function HouseholdTable({
  copy,
  factor,
  formatNumber,
}: {
  copy: WebsiteCopy;
  factor: number;
  formatNumber: (value: number) => string;
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
        <div className="space-y-2">
          {householdRows.map((row) => (
            <div key={row.cluster} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm">
              <span className="font-mono text-[var(--ds-text)]">{row.cluster}</span>
              <span className="text-right tabular-nums text-[var(--ds-text-subtle)]">{row.confidence}</span>
              <span className="text-right tabular-nums text-[var(--ds-text)]">{row.devices}</span>
              <span className="text-right tabular-nums text-[var(--ds-text)]">
                {formatNumber(scale(row.searches, factor))}
              </span>
            </div>
          ))}
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function HeatmapPreview({ copy }: { copy: WebsiteCopy }) {
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
          {heatmapPoints.map((point) => (
            <span
              key={`${point.x}-${point.y}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full blur-xl ${point.size} ${point.tone}`}
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

function ClickpathFlow({ copy }: { copy: WebsiteCopy }) {
  return (
    <DashboardSection className="min-h-full">
      <DashboardSection.Header
        icon={<FlowArrowIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.clickpath}
      />
      <DashboardSection.Body>
        <div className="overflow-x-auto rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-bg-elevated)]">
          <svg className="block min-w-[1020px]" viewBox="0 0 1020 610" role="img" aria-label={copy.sections.clickpath}>
            <defs>
              <linearGradient id="website-flow-line" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#38bdf8" />
                <stop offset="0.52" stopColor="#34d399" />
                <stop offset="1" stopColor="#f59e0b" />
              </linearGradient>
              <marker id="website-flow-arrow" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="5">
                <path d="M0 0 L10 5 L0 10 Z" fill="#34d399" />
              </marker>
            </defs>
            {[78, 182, 286, 390, 494].map((y) => (
              <path key={y} d={`M24 ${y} H996`} stroke="var(--ds-border-subtle)" strokeWidth="1" />
            ))}
            {["SESSION", "SEARCH", "CONTENT", "PLAYER", "OUTBOUND"].map((label, index) => (
              <text key={label} x="32" y={84 + index * 104} fill="var(--ds-text-subtle)" fontSize="12" fontWeight="700">
                {label}
              </text>
            ))}
            <g
              fill="none"
              markerEnd="url(#website-flow-arrow)"
              stroke="url(#website-flow-line)"
              strokeLinecap="round"
              strokeWidth="4"
            >
              <path d="M180 92 C200 92 204 92 226 92" />
              <path d="M342 92 C374 112 364 158 392 196" />
              <path d="M504 196 C530 196 538 196 564 196" />
              <path d="M676 196 C712 218 706 262 740 300" />
              <path d="M812 334 C774 378 724 394 684 402" />
              <path d="M684 402 C748 436 790 468 838 506" />
            </g>
            <path
              d="M740 334 C640 374 532 326 454 230"
              fill="none"
              stroke="#f59e0b"
              strokeDasharray="7 8"
              strokeLinecap="round"
              strokeWidth="2"
            />
            {flowNodes.map((node) => (
              <g key={node.id}>
                <rect
                  fill="var(--ds-surface)"
                  height="68"
                  rx="14"
                  stroke="var(--ds-border-subtle)"
                  width={node.width}
                  x={node.x}
                  y={node.y}
                />
                <circle cx={node.x + 24} cy={node.y + 25} fill={node.id === "listen" ? "#f59e0b" : "#38bdf8"} r="7" />
                <text fill="var(--ds-text)" fontSize="14" fontWeight="700" x={node.x + 42} y={node.y + 30}>
                  {node.label}
                </text>
                <text fill="var(--ds-text-subtle)" fontSize="12" x={node.x + 42} y={node.y + 50}>
                  {node.sub}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <p className="text-sm text-[var(--ds-text-subtle)]">{copy.pathHint}</p>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

function NodeInspector({ copy }: { copy: WebsiteCopy }) {
  return (
    <DashboardSection>
      <DashboardSection.Header
        icon={<MagnifyingGlassIcon weight="duotone" className="h-4 w-4" />}
        title={copy.sections.inspector}
      />
      <DashboardSection.Body>
        <div className="grid gap-2 text-sm">
          {[
            ["event_type", "listen_on_clicked"],
            ["network_cluster", "#8f31"],
            ["device", "iPhone / mobile"],
            ["surface", "share_card"],
            ["service", "apple_music"],
            ["session", "s_4"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="grid grid-cols-[140px_1fr] gap-3 rounded-lg bg-[var(--ds-bg-elevated)] px-3 py-2"
            >
              <span className="font-mono text-xs text-[var(--ds-text-subtle)]">{label}</span>
              <span className="min-w-0 truncate font-mono text-xs text-[var(--ds-text)]">{value}</span>
            </div>
          ))}
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}

export function WebsiteAnalyticsSection({ formatNumber, locale, period }: WebsiteAnalyticsSectionProps) {
  const copy = COPY[locale];
  const factor = PERIOD_FACTOR[period];
  const kpis = useMemo(
    () => [
      { label: copy.kpis.clusters, value: scale(42, factor), sub: "estimated_household" },
      { label: copy.kpis.devices, value: scale(96, factor), sub: "first-party device_key" },
      { label: copy.kpis.sessions, value: scale(118, factor), sub: "session_id" },
      { label: copy.kpis.searches, value: scale(276, factor), sub: "search_submitted" },
      { label: copy.kpis.resolves, value: scale(331, factor), sub: "resolve_succeeded" },
      { label: copy.kpis.listenOn, value: scale(149, factor), sub: "listen_on_clicked" },
    ],
    [copy, factor],
  );

  return (
    <div className="space-y-4">
      <DashboardSection>
        <DashboardSection.Header icon={<ChartLineIcon weight="duotone" className="h-4 w-4" />} title={copy.badge} />
        <DashboardSection.Body>
          <p className="max-w-3xl text-sm text-[var(--ds-text-subtle)]">{copy.note}</p>
        </DashboardSection.Body>
      </DashboardSection>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <WebsiteKpiCard key={kpi.label} label={kpi.label} sub={kpi.sub} value={formatNumber(kpi.value)} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <PlatformFunnel copy={copy} factor={factor} formatNumber={formatNumber} />
        <HouseholdTable copy={copy} factor={factor} formatNumber={formatNumber} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <HeatmapPreview copy={copy} />
        <ClickpathFlow copy={copy} />
      </div>

      <NodeInspector copy={copy} />
    </div>
  );
}
