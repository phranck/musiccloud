import { DashboardInfoCard } from "@/components/ui/DashboardInfoCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import { useAdminStats } from "@/features/overview/hooks/useAdminStats";

export function DashboardPage() {
  const messages = dashboardCopy;
  const dm = messages.dashboard;
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <PageLayout>
        <PageHeader title={dm.overviewTitle} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((key) => (
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <DashboardInfoCard label={dm.cards.tracks} value={stats?.tracks ?? 0} />
        <DashboardInfoCard label={dm.cards.albums} value={stats?.albums ?? 0} />
        <DashboardInfoCard label={dm.cards.artists} value={stats?.artistProfiles ?? stats?.artists ?? 0} />
        <DashboardInfoCard label={dm.cards.artistEntities} value={stats?.artistEntities ?? 0} />
        <DashboardInfoCard label={dm.cards.users} value={stats?.users ?? 0} />
        <DashboardInfoCard
          label={dm.cards.pendingApiAccessRequests}
          value={stats?.pendingApiAccessRequests ?? 0}
          accent
          href="/developer/requests"
        />
      </div>
    </PageLayout>
  );
}
