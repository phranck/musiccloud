import { ENDPOINTS } from "@musiccloud/shared";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type UmamiPeriod = "today" | "7d" | "30d" | "60d" | "90d";

export type UmamiMetricType = "url" | "referrer" | "country" | "region" | "city" | "browser" | "os" | "device";

export interface UmamiKpiMetric {
  value: number;
  change: number;
}

export interface UmamiStats {
  pageviews: UmamiKpiMetric;
  visitors: UmamiKpiMetric;
  visits: UmamiKpiMetric;
  bounces: UmamiKpiMetric;
  totaltime: UmamiKpiMetric;
}

export interface UmamiMetricRow {
  x: string;
  y: number;
  title?: string;
  artist?: string;
}

interface UmamiPageviewSeries {
  pageviews: { x: string; y: number }[];
  sessions: { x: string; y: number }[];
}

interface UmamiRealtimeData {
  totals: { visitors?: number; pageviews?: number; views?: number };
  series: {
    visitors?: { x: number | string; y: number }[];
    pageviews?: { x: number | string; y: number }[];
    views?: { x: number | string; y: number }[];
  };
  urls?: Record<string, number>;
}

interface UmamiActiveData {
  visitors?: number;
}

export function useUmamiStats(period: UmamiPeriod) {
  return useQuery({
    queryKey: ["umami-stats", period],
    queryFn: () => api.get<UmamiStats>(`${ENDPOINTS.admin.analytics.stats}?period=${period}`),
  });
}

export function useUmamiPageviews(period: UmamiPeriod) {
  return useQuery({
    queryKey: ["umami-pageviews", period],
    queryFn: () => api.get<UmamiPageviewSeries>(`${ENDPOINTS.admin.analytics.pageviews}?period=${period}`),
  });
}

export function useUmamiMetrics(type: UmamiMetricType, period: UmamiPeriod) {
  return useQuery({
    queryKey: ["umami-metrics", type, period],
    queryFn: () => api.get<UmamiMetricRow[]>(`${ENDPOINTS.admin.analytics.metrics}?type=${type}&period=${period}`),
  });
}

export function useUmamiActive() {
  return useQuery({
    queryKey: ["umami-active"],
    queryFn: () => api.get<UmamiActiveData>(ENDPOINTS.admin.analytics.active),
    refetchInterval: 30_000,
  });
}

export function useUmamiRealtime() {
  return useQuery({
    queryKey: ["umami-realtime"],
    queryFn: () => api.get<UmamiRealtimeData>(ENDPOINTS.admin.analytics.realtime),
    refetchInterval: 30_000,
  });
}
