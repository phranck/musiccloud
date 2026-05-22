import type { UmamiPeriod } from "@/features/analytics/hooks/useUmamiStats";

const WEBSITE_ANALYTICS_PERIODS: UmamiPeriod[] = ["today", "7d", "30d", "60d", "90d"];

interface WebsiteAnalyticsPeriodLabels {
  today: string;
  d7: string;
  d30: string;
  d60: string;
  d90: string;
}

export function loadWebsiteAnalyticsPeriod(storageKey: string): UmamiPeriod {
  const saved = localStorage.getItem(storageKey);
  if (saved && WEBSITE_ANALYTICS_PERIODS.some((period) => period === saved)) return saved as UmamiPeriod;
  return "7d";
}

export function buildWebsiteAnalyticsPeriodOptions(
  labels: WebsiteAnalyticsPeriodLabels,
): { label: string; value: UmamiPeriod }[] {
  return [
    { value: "today", label: labels.today },
    { value: "7d", label: labels.d7 },
    { value: "30d", label: labels.d30 },
    { value: "60d", label: labels.d60 },
    { value: "90d", label: labels.d90 },
  ];
}
