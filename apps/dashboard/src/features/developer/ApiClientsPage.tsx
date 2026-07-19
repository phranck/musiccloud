import {
  Code as CodeIcon,
  MagnifyingGlass as MagnifyingGlassIcon,
  PencilSimple as PencilSimpleIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { type ColumnDef, DataTable } from "@/components/ui/Table";
import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";
import type { ApiClientResponse } from "@/features/developer/api";
import { ApiClientStatus, ApiTokenStatus } from "@/features/developer/domain";
import { useApiAccessOverview } from "@/features/developer/hooks/useDeveloperData";

const messages = dashboardCopy;
const dm = messages.developer;

/**
 * Builds the memoized column definitions for the API clients table.
 *
 * Columns: active token prefix (key), app name, developer contact email,
 * configured traffic limits, client status badge, and an edit action that
 * navigates to the client detail page.
 *
 * @param dm - Developer section of the localized dashboard messages.
 * @param common - Common (shared) localized dashboard messages.
 * @param navigate - Router navigate function used by the edit action.
 * @returns Stable column definitions, re-created only when a dependency changes.
 */
function useClientColumns(
  dm: (typeof dashboardCopy)["developer"],
  common: (typeof dashboardCopy)["common"],
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<ApiClientResponse>[] {
  return useMemo<ColumnDef<ApiClientResponse>[]>(
    () => [
      {
        id: "apiKey",
        header: dm.colKey,
        headerClassName: "whitespace-nowrap",
        sortKey: (c) => {
          const activeToken = c.tokens.find((t) => t.status === ApiTokenStatus.Active);
          return (activeToken?.tokenPrefix ?? "").toLowerCase();
        },
        cell: (c) => {
          const activeToken = c.tokens.find((t) => t.status === ApiTokenStatus.Active);
          const prefix = activeToken?.tokenPrefix ?? c.tokens[0]?.tokenPrefix;
          return (
            <code className="text-sm text-[var(--ds-accent)]">
              {prefix ? `${prefix}-...` : <span className="text-[var(--ds-text-muted)]">{dm.clientsNoTokens}</span>}
            </code>
          );
        },
      },
      {
        id: "appName",
        header: dm.colApp,
        headerClassName: "whitespace-nowrap",
        sortKey: (c) => `${c.projectDisplayName} ${c.appName}`.toLowerCase(),
        cell: (c) => (
          <span className="flex flex-col">
            <span className="font-medium text-[var(--ds-text)]">{c.projectDisplayName}</span>
            <span className="text-xs text-[var(--ds-text-muted)]">
              {c.appName} · {c.registrationType} · {c.publicClientId}
            </span>
          </span>
        ),
      },
      {
        id: "contactEmail",
        header: dm.colDeveloper,
        headerClassName: "whitespace-nowrap",
        sortKey: (c) => c.contactEmail.toLowerCase(),
        cell: (c) => (
          <a href={`mailto:${c.contactEmail}`} className="text-[var(--ds-text)] hover:underline">
            {c.contactEmail}
          </a>
        ),
      },
      {
        id: "traffic",
        header: dm.clientTrafficLabel,
        headerClassName: "whitespace-nowrap",
        className: "w-52",
        sortKey: (c) => c.effectiveRequestsPerMinute,
        cell: (c) => (
          <span className="inline-flex items-center gap-1.5">
            <span>
              {c.effectiveRequestsPerMinute}
              {dm.perMinute} &middot; {c.effectiveRequestsPerDay}
              {dm.perDay}
            </span>
            {(c.projectRequestsPerMinute != null || c.projectRequestsPerDay != null) && (
              <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-xs font-semibold text-violet-400">
                {dm.clientCustomBadge}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: dm.colStatus,
        headerClassName: "whitespace-nowrap",
        className: "w-28",
        sortKey: (c) => c.status,
        cell: (c) => {
          const cls =
            c.status === ApiClientStatus.Active
              ? "bg-emerald-500/10 text-emerald-400"
              : c.status === ApiClientStatus.Suspended
                ? "bg-amber-500/10 text-amber-400"
                : "bg-red-500/10 text-red-400";
          const label =
            c.status === ApiClientStatus.Active
              ? dm.statusActive
              : c.status === ApiClientStatus.Suspended
                ? dm.statusSuspended
                : dm.statusRevoked;
          return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{label}</span>;
        },
      },
      {
        id: "actions",
        className: "w-24",
        cell: (c) => (
          <div className="flex justify-end">
            <TableActionButton
              onClick={() => navigate(`/developer/clients/${c.id}`)}
              icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
              label={common.edit}
            />
          </div>
        ),
      },
    ],
    [dm, common, navigate],
  );
}

/**
 * Admin page listing all API clients with their active key, app, developer,
 * traffic limits and status.
 *
 * A footer search field (focusable via Cmd/Ctrl+K) filters across key prefix,
 * app name, developer email and the formatted traffic values.
 */
export function ApiClientsPage() {
  const { data, isLoading } = useApiAccessOverview();
  const navigate = useNavigate();
  const columns = useClientColumns(dm, messages.common, navigate);
  const clients = useMemo(() => data?.clients ?? [], [data]);
  const [search, setSearch] = useState("");

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => {
      const activeToken = c.tokens.find((t) => t.status === ApiTokenStatus.Active);
      const prefix = activeToken?.tokenPrefix ?? c.tokens[0]?.tokenPrefix ?? "";
      return (
        prefix.toLowerCase().includes(q) ||
        c.appName.toLowerCase().includes(q) ||
        c.projectDisplayName.toLowerCase().includes(q) ||
        c.publicClientId.toLowerCase().includes(q) ||
        c.registrationType.toLowerCase().includes(q) ||
        c.contactEmail.toLowerCase().includes(q) ||
        `${c.effectiveRequestsPerMinute}${dm.perMinute} ${c.effectiveRequestsPerDay}${dm.perDay}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [clients, search]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("api-keys-search")?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <PageLayout>
      <PageHeader title={dm.clientsTitle} />

      {isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

      {!isLoading && clients.length === 0 && (
        <ContentUnavailableView
          icon={<CodeIcon weight="duotone" aria-hidden />}
          title={dm.clientsEmpty}
          subtitle={dm.clientsEmptyHint}
          className="flex-1 min-h-0"
        />
      )}

      {!isLoading && clients.length > 0 && (
        <DashboardSection className="overflow-hidden flex-1 min-h-0 flex flex-col">
          <DashboardSection.Header icon={<CodeIcon weight="duotone" className="size-4" />} title={dm.clientsTitle} />
          <DashboardSection.Body flush>
            {filteredClients.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-[var(--ds-text-muted)]">
                  {dm.clientsSearchNoResults.replace("{q}", search)}
                </p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <DataTable
                  columns={columns}
                  data={filteredClients}
                  getRowKey={(c) => c.id}
                  stickyHeader
                  defaultSort={{ id: "appName", dir: "asc" }}
                />
              </div>
            )}
          </DashboardSection.Body>
        </DashboardSection>
      )}

      {clients.length > 0 && (
        <div className="flex justify-center mt-4">
          <div className="relative w-full max-w-md">
            <MagnifyingGlassIcon
              weight="duotone"
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--ds-text-muted)] pointer-events-none"
            />
            <input
              id="api-keys-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={dm.clientsSearchPlaceholder}
              aria-label={dm.clientsSearchPlaceholder}
              className="w-full h-9 pl-9 pr-8 rounded-control border border-[var(--ds-border)] bg-[var(--ds-bg)] text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] focus:outline-none focus:border-[var(--ds-border-strong)]"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--ds-text-muted)] bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded px-1.5 py-0.5 pointer-events-none">
              ⌘K
            </kbd>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
