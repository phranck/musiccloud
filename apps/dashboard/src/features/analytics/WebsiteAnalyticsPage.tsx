import { ENDPOINTS } from "@musiccloud/shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useI18n } from "@/context/I18nContext";
import type { UmamiPeriod } from "@/features/analytics/hooks/useUmamiStats";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { getSegmentedStorageKey } from "@/lib/segmented-storage";

import { type WebsiteAnalyticsOverview, WebsiteAnalyticsSection } from "./WebsiteAnalyticsSection";

const WEBSITE_ANALYTICS_PERIODS: UmamiPeriod[] = ["today", "7d", "30d", "60d", "90d"];

function loadWebsiteAnalyticsPeriod(storageKey: string): UmamiPeriod {
  const saved = localStorage.getItem(storageKey);
  if (saved && WEBSITE_ANALYTICS_PERIODS.some((period) => period === saved)) return saved as UmamiPeriod;
  return "7d";
}

export function WebsiteAnalyticsPage() {
  const { user } = useAuth();
  const { locale, messages, formatNumber } = useI18n();
  const periodStorageKey = getSegmentedStorageKey(user?.id, "website-analytics:period");
  const [period, setPeriod] = useState<UmamiPeriod>(() => loadWebsiteAnalyticsPeriod(periodStorageKey));
  const m = messages.analytics;
  const overviewQuery = useQuery({
    queryKey: ["website-analytics-overview", period],
    queryFn: () => api.get<WebsiteAnalyticsOverview>(`${ENDPOINTS.admin.analytics.website.overview}?period=${period}`),
  });

  const handlePeriodChange = useCallback((nextPeriod: UmamiPeriod) => {
    setPeriod(nextPeriod);
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
          formatNumber={formatNumber}
          isLoading={overviewQuery.isLoading}
          locale={locale}
        />
      </PageBody>
    </PageLayout>
  );
}
