import { ENDPOINTS } from "@musiccloud/shared";
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
  type WebsiteAnalyticsDrilldown,
  type WebsiteAnalyticsExport,
  type WebsiteAnalyticsOverview,
  type WebsiteAnalyticsRetentionResult,
  WebsiteAnalyticsSection,
} from "./WebsiteAnalyticsSection";
import { buildWebsiteAnalyticsPeriodOptions, loadWebsiteAnalyticsPeriod } from "./websiteAnalyticsPeriod";

interface WebsiteAnalyticsPageState {
  period: UmamiPeriod;
  retentionResult: WebsiteAnalyticsRetentionResult | null;
  selectedClusterKey: string | null;
  selectedDeviceKey: string | null;
  selectedSessionId: string | null;
}

type WebsiteAnalyticsPageAction =
  | { type: "periodChanged"; period: UmamiPeriod }
  | { type: "retentionCompleted"; result: WebsiteAnalyticsRetentionResult }
  | { type: "selectedClusterChanged"; clusterKey: string | null }
  | { type: "selectedDeviceChanged"; deviceKey: string | null }
  | { type: "selectedSessionChanged"; sessionId: string | null };

function websiteAnalyticsPageReducer(
  state: WebsiteAnalyticsPageState,
  action: WebsiteAnalyticsPageAction,
): WebsiteAnalyticsPageState {
  switch (action.type) {
    case "periodChanged":
      return {
        ...state,
        period: action.period,
        selectedClusterKey: null,
        selectedDeviceKey: null,
        selectedSessionId: null,
      };
    case "retentionCompleted":
      return { ...state, retentionResult: action.result };
    case "selectedClusterChanged":
      return {
        ...state,
        selectedClusterKey: action.clusterKey,
        selectedDeviceKey: null,
        selectedSessionId: null,
      };
    case "selectedDeviceChanged":
      return { ...state, selectedDeviceKey: action.deviceKey, selectedSessionId: null };
    case "selectedSessionChanged":
      return { ...state, selectedSessionId: action.sessionId };
  }
}

export function WebsiteAnalyticsPage() {
  const { user } = useAuth();
  const { locale, messages, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const periodStorageKey = getSegmentedStorageKey(user?.id, "website-analytics:period");
  const [state, dispatch] = useReducer(websiteAnalyticsPageReducer, periodStorageKey, (storageKey) => ({
    period: loadWebsiteAnalyticsPeriod(storageKey),
    retentionResult: null,
    selectedClusterKey: null,
    selectedDeviceKey: null,
    selectedSessionId: null,
  }));
  const { period, retentionResult, selectedClusterKey, selectedDeviceKey, selectedSessionId } = state;
  const m = messages.analytics;
  const detailPath = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (selectedClusterKey) params.set("clusterKey", selectedClusterKey);
    if (selectedDeviceKey) params.set("deviceKey", selectedDeviceKey);
    if (selectedSessionId) params.set("sessionId", selectedSessionId);
    return `${ENDPOINTS.admin.analytics.website.detail}?${params.toString()}`;
  }, [period, selectedClusterKey, selectedDeviceKey, selectedSessionId]);
  const overviewQuery = useQuery({
    queryKey: ["website-analytics-overview", period],
    queryFn: () => api.get<WebsiteAnalyticsOverview>(`${ENDPOINTS.admin.analytics.website.overview}?period=${period}`),
  });
  const detailQuery = useQuery({
    queryKey: ["website-analytics-detail", period, selectedClusterKey, selectedDeviceKey, selectedSessionId],
    queryFn: () => api.get<WebsiteAnalyticsDrilldown>(detailPath),
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
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-detail"] });
    },
  });
  const retentionMutation = useMutation({
    mutationFn: () => api.post<WebsiteAnalyticsRetentionResult>(ENDPOINTS.admin.analytics.website.retention),
    onSuccess: (result) => {
      dispatch({ type: "retentionCompleted", result });
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-detail"] });
    },
  });

  const handlePeriodChange = useCallback((nextPeriod: UmamiPeriod) => {
    dispatch({ type: "periodChanged", period: nextPeriod });
  }, []);

  const handleSelectCluster = useCallback((clusterKey: string | null) => {
    dispatch({ type: "selectedClusterChanged", clusterKey });
  }, []);

  const handleSelectDevice = useCallback((deviceKey: string | null) => {
    dispatch({ type: "selectedDeviceChanged", deviceKey });
  }, []);

  const handleSelectSession = useCallback((sessionId: string | null) => {
    dispatch({ type: "selectedSessionChanged", sessionId });
  }, []);

  const periodOptions = useMemo<{ label: string; value: UmamiPeriod }[]>(
    () => buildWebsiteAnalyticsPeriodOptions(m.periods),
    [m],
  );

  return (
    <PageLayout>
      <PageHeader title={messages.layout.sidebar.websiteAnalytics} />
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
          detail={detailQuery.data}
          formatNumber={formatNumber}
          isExporting={exportMutation.isPending}
          isLoading={overviewQuery.isLoading || detailQuery.isLoading}
          isRunningRetention={retentionMutation.isPending}
          locale={locale}
          onExport={() => exportMutation.mutate()}
          onRunRetention={() => retentionMutation.mutate()}
          onSelectCluster={handleSelectCluster}
          onSelectDevice={handleSelectDevice}
          onSelectSession={handleSelectSession}
          retentionResult={retentionResult}
          selectedClusterKey={selectedClusterKey}
          selectedDeviceKey={selectedDeviceKey}
          selectedSessionId={selectedSessionId}
        />
      </PageBody>
    </PageLayout>
  );
}
