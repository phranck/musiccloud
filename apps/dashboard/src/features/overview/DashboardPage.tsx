import { DashboardInfoCard } from "@/components/ui/DashboardInfoCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useAdminStats } from "@/features/overview/hooks/useAdminStats";

export function DashboardPage() {
  const { messages } = useI18n();
  const dm = messages.dashboard;
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <PageLayout>
        <PageHeader title={dm.overviewTitle} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => `sk-${i}`).map((key) => (
            <div
              key={key}
              className="h-28 bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] animate-pulse"
            />
          ))}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader title={dm.overviewTitle} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <DashboardInfoCard label={dm.cards.tracks} value={stats?.tracks ?? 0} />
        <DashboardInfoCard label={dm.cards.albums} value={stats?.albums ?? 0} />
        <DashboardInfoCard label={dm.cards.artists} value={stats?.artists ?? 0} />
        <DashboardInfoCard label={dm.cards.users} value={stats?.users ?? 0} />
      </div>
    </PageLayout>
  );
}
