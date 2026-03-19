import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface UmamiPageView {
  path: string;
  views: number;
  visitors: number;
}

export interface UmamiStats {
  pageviews: { value: number; prev: number };
  visitors: { value: number; prev: number };
  visits: { value: number; prev: number };
  bounces: { value: number; prev: number };
  totaltime: { value: number; prev: number };
}

export interface UmamiTimeSeries {
  date: string;
  pageviews: number;
  visitors: number;
}

export function useUmamiStats(period: string) {
  return useQuery({
    queryKey: ["umami-stats", period],
    queryFn: () => api.get<UmamiStats>(`/admin/analytics/stats?period=${period}`),
  });
}

export function useUmamiPageViews(period: string) {
  return useQuery({
    queryKey: ["umami-pageviews", period],
    queryFn: () => api.get<UmamiPageView[]>(`/admin/analytics/pageviews?period=${period}`),
  });
}

export function useUmamiTimeSeries(period: string) {
  return useQuery({
    queryKey: ["umami-timeseries", period],
    queryFn: () => api.get<UmamiTimeSeries[]>(`/admin/analytics/timeseries?period=${period}`),
  });
}
