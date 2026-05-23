import { DashboardButton } from "@musiccloud/dashboard-ui";
import { ENDPOINTS } from "@musiccloud/shared";
import { DownloadIcon, TrashIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useReducer } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useI18n } from "@/context/I18nContext";
import type { UmamiPeriod } from "@/features/analytics/hooks/useUmamiStats";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { getSegmentedStorageKey } from "@/lib/segmented-storage";
import {
  type WebsiteAnalyticsExport,
  type WebsiteAnalyticsOverview,
  type WebsiteAnalyticsRetentionResult,
  WebsiteAnalyticsSection,
} from "./WebsiteAnalyticsSection";
import { buildWebsiteAnalyticsPeriodOptions, loadWebsiteAnalyticsPeriod } from "./websiteAnalyticsPeriod";
import { getWebsiteAnalyticsCopy } from "./websiteAnalyticsText";

const WEBSITE_ANALYTICS_POLLING_INTERVAL_MS = {
  today: 10_000,
  default: 30_000,
} as const;

interface WebsiteAnalyticsPageState {
  period: UmamiPeriod;
}

type WebsiteAnalyticsPageAction = { type: "periodChanged"; period: UmamiPeriod };

function websiteAnalyticsPageReducer(
  state: WebsiteAnalyticsPageState,
  action: WebsiteAnalyticsPageAction,
): WebsiteAnalyticsPageState {
  switch (action.type) {
    case "periodChanged":
      return {
        ...state,
        period: action.period,
      };
  }
}

function websiteAnalyticsPollingInterval(period: UmamiPeriod) {
  return period === "today"
    ? WEBSITE_ANALYTICS_POLLING_INTERVAL_MS.today
    : WEBSITE_ANALYTICS_POLLING_INTERVAL_MS.default;
}

function WebsiteAnalyticsHeaderActions({
  exportLabel,
  isExporting,
  isRunningRetention,
  onExport,
  onRunRetention,
  retentionLabel,
}: {
  exportLabel: string;
  isExporting: boolean;
  isRunningRetention: boolean;
  onExport: () => void;
  onRunRetention: () => void;
  retentionLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <DashboardButton
        type="button"
        onClick={onExport}
        disabled={isExporting}
        leadingIcon={<DownloadIcon weight="duotone" className="size-3.5" />}
        size="action"
        variant="neutral"
      >
        {exportLabel}
      </DashboardButton>
      <DashboardButton
        type="button"
        onClick={onRunRetention}
        disabled={isRunningRetention}
        leadingIcon={<TrashIcon weight="duotone" className="size-3.5" />}
        size="action"
        variant="neutral"
      >
        {retentionLabel}
      </DashboardButton>
    </div>
  );
}

export function WebsiteAnalyticsPage() {
  const { user } = useAuth();
  const { locale, messages, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const periodStorageKey = getSegmentedStorageKey(user?.id, "website-analytics:period");
  const [state, dispatch] = useReducer(websiteAnalyticsPageReducer, periodStorageKey, (storageKey) => ({
    period: loadWebsiteAnalyticsPeriod(storageKey),
  }));
  const { period } = state;
  const pollingInterval = websiteAnalyticsPollingInterval(period);
  const m = messages.analytics;
  const websiteCopy = getWebsiteAnalyticsCopy(locale);
  const overviewQuery = useQuery({
    queryKey: ["website-analytics-overview", period],
    queryFn: () => api.get<WebsiteAnalyticsOverview>(`${ENDPOINTS.admin.analytics.website.overview}?period=${period}`),
    refetchInterval: pollingInterval,
    refetchIntervalInBackground: false,
  });
  const exportMutation = useMutation({
    mutationFn: () => api.get<WebsiteAnalyticsExport>(`${ENDPOINTS.admin.analytics.website.export}?period=${period}`),
    onSuccess: (payload) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `website-analytics-${period}.json`;
      link.click();
      URL.revokeObjectURL(url);
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-overview"] });
    },
  });
  const retentionMutation = useMutation({
    mutationFn: () => api.post<WebsiteAnalyticsRetentionResult>(ENDPOINTS.admin.analytics.website.retention),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-overview"] });
    },
  });

  const handlePeriodChange = useCallback((nextPeriod: UmamiPeriod) => {
    dispatch({ type: "periodChanged", period: nextPeriod });
  }, []);

  const periodOptions = useMemo<{ label: string; value: UmamiPeriod }[]>(
    () => buildWebsiteAnalyticsPeriodOptions(m.periods),
    [m],
  );

  return (
    <PageLayout>
      <PageHeader title={messages.layout.sidebar.websiteAnalytics}>
        <WebsiteAnalyticsHeaderActions
          exportLabel={websiteCopy.exportJson}
          isExporting={exportMutation.isPending}
          isRunningRetention={retentionMutation.isPending}
          onExport={() => exportMutation.mutate()}
          onRunRetention={() => retentionMutation.mutate()}
          retentionLabel={websiteCopy.retention}
        />
      </PageHeader>
      <PageBody className="overflow-y-auto -mx-3 -mt-3 px-3 pt-3 pb-3">
        <div className="flex justify-end pb-4">
          <SegmentedControl
            value={period}
            onChange={handlePeriodChange}
            storageKey={periodStorageKey}
            options={periodOptions}
          />
        </div>
        <WebsiteAnalyticsSection
          data={overviewQuery.data}
          environmentStorageKey={getSegmentedStorageKey(user?.id, "website-analytics:environment")}
          formatNumber={formatNumber}
          isLoading={overviewQuery.isLoading}
          locale={locale}
        />
      </PageBody>
    </PageLayout>
  );
}
