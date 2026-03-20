export function AnalyticsLoadingFallback() {
  return (
    <div className="space-y-4">
      <div className="h-48 bg-[var(--ds-bg-elevated)] rounded-xl animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }, (_, i) => `kpi-sk-${i}`).map((k) => (
          <div key={k} className="h-16 bg-[var(--ds-bg-elevated)] rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-48 bg-[var(--ds-bg-elevated)] rounded-xl animate-pulse" />
    </div>
  );
}
