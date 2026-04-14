import type { PluginInfo } from "@musiccloud/shared";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { usePlugins, useTogglePlugin } from "@/features/services/hooks/usePlugins";
import { PluginCard } from "@/features/services/PluginCard";

export function ServicesPage() {
  const { messages } = useI18n();
  const s = messages.services;
  const { data, isLoading, error } = usePlugins();
  const toggle = useTogglePlugin();
  const [flashError, setFlashError] = useState<string | null>(null);

  const sortedPlugins = useMemo<PluginInfo[]>(() => {
    if (!data) return [];
    return [...data].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data]);

  const enabledCount = useMemo(() => sortedPlugins.filter((p) => p.enabled && p.available).length, [sortedPlugins]);

  function handleToggle(plugin: PluginInfo, next: boolean) {
    setFlashError(null);
    toggle.mutate({ id: plugin.id, enabled: next }, { onError: () => setFlashError(s.toggleError) });
  }

  return (
    <PageLayout>
      <PageHeader title={s.title} />
      <PageBody className="gap-4 p-4">
        <p className="text-sm text-[var(--ds-text-muted)] max-w-3xl">{s.subtitle}</p>

        {flashError && (
          <div className="rounded-md border border-[var(--ds-btn-danger-border)] bg-[var(--ds-btn-danger-bg)]/5 text-sm text-[var(--ds-btn-danger-text)] px-3 py-2">
            {flashError}
          </div>
        )}

        {enabledCount === 0 && !isLoading && sortedPlugins.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 text-sm text-amber-500 px-3 py-2">
            {s.lastServiceWarning}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-[var(--ds-text-muted)]">{s.loading}</p>
        ) : error ? (
          <p className="text-sm text-[var(--ds-btn-danger-text)]">{s.loadError}</p>
        ) : sortedPlugins.length === 0 ? (
          <p className="text-sm text-[var(--ds-text-muted)]">{s.empty}</p>
        ) : (
          <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
            {sortedPlugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                disabled={toggle.isPending && toggle.variables?.id === plugin.id}
                onToggle={(next) => handleToggle(plugin, next)}
              />
            ))}
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}
