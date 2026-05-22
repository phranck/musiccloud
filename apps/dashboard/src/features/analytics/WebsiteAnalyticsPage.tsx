import { ENDPOINTS } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

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

const WEBSITE_ANALYTICS_PERIODS: UmamiPeriod[] = ["today", "7d", "30d", "60d", "90d"];

function loadWebsiteAnalyticsPeriod(storageKey: string): UmamiPeriod {
  const saved = localStorage.getItem(storageKey);
  if (saved && WEBSITE_ANALYTICS_PERIODS.some((period) => period === saved)) return saved as UmamiPeriod;
  return "7d";
}

export function WebsiteAnalyticsPage() {
  const { user } = useAuth();
  const { locale, messages, formatNumber } = useI18n();
  const queryClient = useQueryClient();
  const periodStorageKey = getSegmentedStorageKey(user?.id, "website-analytics:period");
  const [period, setPeriod] = useState<UmamiPeriod>(() => loadWebsiteAnalyticsPeriod(periodStorageKey));
  const [selectedClusterKey, setSelectedClusterKey] = useState<string | null>(null);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [retentionResult, setRetentionResult] = useState<WebsiteAnalyticsRetentionResult | null>(null);
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
    },
  });
  const retentionMutation = useMutation({
    mutationFn: () => api.post<WebsiteAnalyticsRetentionResult>(ENDPOINTS.admin.analytics.website.retention),
    onSuccess: (result) => {
      setRetentionResult(result);
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["website-analytics-detail"] });
    },
  });

  const handlePeriodChange = useCallback((nextPeriod: UmamiPeriod) => {
    setPeriod(nextPeriod);
    setSelectedClusterKey(null);
    setSelectedDeviceKey(null);
    setSelectedSessionId(null);
  }, []);

  const handleSelectCluster = useCallback((clusterKey: string | null) => {
    setSelectedClusterKey(clusterKey);
    setSelectedDeviceKey(null);
    setSelectedSessionId(null);
  }, []);

  const handleSelectDevice = useCallback((deviceKey: string | null) => {
    setSelectedDeviceKey(deviceKey);
    setSelectedSessionId(null);
  }, []);

  const handleSelectSession = useCallback((sessionId: string | null) => {
    setSelectedSessionId(sessionId);
  }, []);

  const periodOptions = useMemo<{ label: string; value: UmamiPeriod }[]>(
    () => [
      { value: "today", label: m.periods.today },
      { value: "7d", label: m.periods.d7 },
      { value: "30d", label: m.periods.d30 },
      { value: "60d", label: m.periods.d60 },
      { value: "90d", label: m.periods.d90 },
    ],
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
