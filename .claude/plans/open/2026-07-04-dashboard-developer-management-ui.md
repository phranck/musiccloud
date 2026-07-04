# Dashboard Developer-Management – UI

Plan-Nr.: MC-091

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar-Section + 4 Pages + Overview-Card für das Developer-Management im Admin-Dashboard bauen.

**Architecture:** `SidebarDeveloperSection` in `Sidebar.tsx`, 4 neue Pages in `features/developer/`, Routen unter `RequireNonModerator`, Overview-Stat-Card in `DashboardPage`. Alle Pages nutzen den API-Client aus MC-090 und folgen bestehenden Dashboard-Patterns (Tabelle, Card, DashboardSection).

**Tech Stack:** React, React Router, React Query, Phosphor Icons, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-07-04-dashboard-developer-management-design.md`

**Prerequisite:** MC-090 (Backend & Foundation) muss abgeschlossen sein.

---

### Task 1: `SidebarDeveloperSection` in Sidebar.tsx

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: `SidebarDeveloperSection`-Komponente schreiben**

In `Sidebar.tsx`, vor der `export function Sidebar`-Zeile (nach `SidebarAnalyticsSection`), neue Komponente einfügen:

```tsx
function SidebarDeveloperSection({
  onItemClick,
  pendingRequests,
  s,
}: {
  onItemClick?: () => void;
  pendingRequests?: number;
  s: SidebarLabels;
}) {
  return (
    <div className="mt-3">
      <DashboardSection>
        <DashboardSection.Header
          icon={<KeyIcon weight="duotone" className="w-4 h-4" />}
          title={s.sectionDeveloper}
        />
        <DashboardSection.Body className="!gap-0.5 !p-2">
          <NavLink to="/developer/requests" onClick={onItemClick} className="contents">
            {({ isActive }) => (
              <DashboardSection.Item
                icon={<ClipboardTextIcon weight="duotone" className="w-4 h-4" />}
                label={s.apiAccessRequests}
                badge={pendingRequests}
                active={isActive}
              />
            )}
          </NavLink>
          <NavLink to="/developer/clients" onClick={onItemClick} className="contents">
            {({ isActive }) => (
              <DashboardSection.Item
                icon={<PlugsConnectedIcon weight="duotone" className="w-4 h-4" />}
                label={s.clientsAndTokens}
                active={isActive}
              />
            )}
          </NavLink>
          <NavLink to="/developer/accounts" onClick={onItemClick} className="contents">
            {({ isActive }) => (
              <DashboardSection.Item
                icon={<UsersThreeIcon weight="duotone" className="w-4 h-4" />}
                label={s.developerAccounts}
                active={isActive}
              />
            )}
          </NavLink>
        </DashboardSection.Body>
      </DashboardSection>
    </div>
  );
}
```

- [ ] **Step 2: Icons importieren**

In den bestehenden Phosphor-Import-Block zwei neue Icons hinzufügen:

```tsx
import {
  // ... existing imports ...
  ClipboardTextIcon,
  KeyIcon,
} from "@phosphor-icons/react";
```

- [ ] **Step 3: In der Sidebar-Render-Funktion einbauen**

In der `Sidebar`-Komponente, zwischen `SidebarAnalyticsSection`-Block und dem System-Section-Block:

```tsx
{/* Developer */}
{isAdmin && (
  <SidebarDeveloperSection
    onItemClick={onItemClick}
    pendingRequests={stats?.pendingApiAccessRequests}
    s={s}
  />
)}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

Erwartet: Fehler wegen fehlender i18n-Keys → in Task 2 beheben.

---

### Task 2: React-Query-Hooks für Developer-Daten

**Files:**
- Create: `apps/dashboard/src/features/developer/hooks/useDeveloperData.ts`

- [ ] **Step 1: Hooks-Datei erstellen**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveApiAccessRequest,
  createClientToken,
  fetchApiAccessOverview,
  fetchApiAccessRequest,
  fetchDeveloperAccounts,
  rejectApiAccessRequest,
  revokeToken,
  rotateToken,
  type ApiAccessOverview,
  type ApiClientResponse,
} from "@/features/developer/api";

export function useApiAccessOverview(status?: string) {
  return useQuery<ApiAccessOverview>({
    queryKey: ["developer", "api-access", status ?? "all"],
    queryFn: () => fetchApiAccessOverview(status),
  });
}

export function useApiAccessRequest(id: string) {
  return useQuery({
    queryKey: ["developer", "api-access-request", id],
    queryFn: () => fetchApiAccessRequest(id),
    enabled: !!id,
  });
}

export function useDeveloperAccounts() {
  return useQuery({
    queryKey: ["developer", "accounts"],
    queryFn: fetchDeveloperAccounts,
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string; requestsPerMinute?: number; requestsPerDay?: number }) =>
      approveApiAccessRequest(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewNote }: { id: string; reviewNote: string }) =>
      rejectApiAccessRequest(id, { reviewNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => createClientToken(clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => revokeToken(tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}

export function useRotateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => rotateToken(tokenId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["developer"] });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

---

### Task 3: `ApiAccessRequestsPage` – Requests-Liste

**Files:**
- Create: `apps/dashboard/src/features/developer/ApiAccessRequestsPage.tsx`

- [ ] **Step 1: Page-Komponente schreiben**

Pattern: `TracksPage` (Tabelle, Filter-Pills, useNavigate).

```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useApiAccessOverview } from "@/features/developer/hooks/useDeveloperData";
import { ApiAccessRequestStatus } from "@/features/developer/domain";

export function ApiAccessRequestsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const { data, isLoading } = useApiAccessOverview(filter);
  const navigate = useNavigate();

  const filters = [
    { key: undefined, label: dm.requestsFilterAll },
    { key: ApiAccessRequestStatus.Pending, label: dm.requestsFilterPending },
    { key: ApiAccessRequestStatus.Approved, label: dm.requestsFilterApproved },
    { key: ApiAccessRequestStatus.Rejected, label: dm.requestsFilterRejected },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      [ApiAccessRequestStatus.Pending]: { bg: "bg-amber-500/10", text: "text-amber-400", label: dm.statusPending },
      [ApiAccessRequestStatus.Approved]: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: dm.statusApproved },
      [ApiAccessRequestStatus.Rejected]: { bg: "bg-red-500/10", text: "text-red-400", label: dm.statusRejected },
    };
    const s = map[status] ?? { bg: "bg-gray-500/10", text: "text-gray-400", label: status };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  return (
    <PageLayout>
      <PageHeader title={dm.requestsTitle} />
      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key ?? "__all"}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-[var(--ds-accent)] text-black"
                : "bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      ) : (
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--ds-border-subtle)] text-xs text-[var(--ds-text-muted)] uppercase tracking-wide">
                <th className="text-left p-3 font-medium">{dm.colApp}</th>
                <th className="text-left p-3 font-medium">{dm.colDeveloper}</th>
                <th className="text-left p-3 font-medium">{dm.colTraffic}</th>
                <th className="text-left p-3 font-medium">{dm.colSubmitted}</th>
                <th className="text-left p-3 font-medium">{dm.colStatus}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.requests ?? []).map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/developer/requests/${r.id}`)}
                  className="border-b border-[var(--ds-border-subtle)] hover:bg-[var(--ds-nav-hover-bg)] cursor-pointer transition-colors"
                >
                  <td className="p-3 text-sm font-medium">{r.appName}</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">{r.contactEmail}</td>
                  <td className="p-3 text-sm">~{r.estimatedRequestsPerDay} / Tag</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">
                    {new Date(r.submittedAt).toLocaleDateString("de-AT")}
                  </td>
                  <td className="p-3">{statusBadge(r.status)}</td>
                </tr>
              ))}
              {(!data || data.requests.length === 0) && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-[var(--ds-text-muted)]">
                    Keine Requests
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  );
}
```

- [ ] **Step 2: Typecheck nach Task-Kette**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

---

### Task 4: `RequestDetailPage` – Approve/Reject

**Files:**
- Create: `apps/dashboard/src/features/developer/RequestDetailPage.tsx`

- [ ] **Step 1: Page-Komponente schreiben**

Pattern: `TrackEditPage` (Back-Label, Info-Blöcke, Actions).

```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useApiAccessRequest, useApproveRequest, useRejectRequest } from "@/features/developer/hooks/useDeveloperData";
import { ApiAccessRequestStatus } from "@/features/developer/domain";

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { messages } = useI18n();
  const dm = messages.developer;
  const navigate = useNavigate();
  const { data, isLoading } = useApiAccessRequest(id!);
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const [showReject, setShowReject] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reqPerMin, setReqPerMin] = useState(60);
  const [reqPerDay, setReqPerDay] = useState(1000);

  if (isLoading || !data) {
    return (
      <PageLayout>
        <PageHeader title="" />
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      </PageLayout>
    );
  }

  const r = data.request;

  return (
    <PageLayout>
      <button
        type="button"
        onClick={() => navigate("/developer/requests")}
        className="text-sm text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] mb-4 transition-colors"
      >
        {dm.detailBackLabel}
      </button>
      <PageHeader title={r.appName} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-1">{dm.colDeveloper}</div>
          <div className="text-sm">{r.contactEmail}</div>
        </div>
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-1">{dm.colSubmitted}</div>
          <div className="text-sm">{new Date(r.submittedAt).toLocaleDateString("de-AT")}</div>
        </div>
      </div>

      <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4 mb-6">
        <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">Beschreibung</div>
        <p className="text-sm leading-relaxed">{r.appDescription}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-1">{dm.colTraffic}</div>
          <div className="text-sm font-semibold">~{r.estimatedRequestsPerDay} / Tag</div>
        </div>
      </div>

      {r.status === ApiAccessRequestStatus.Pending && (
        <>
          <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4 mb-6">
            <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-3">
              Rate Limits (optionaler Override)
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[var(--ds-text-muted)] mb-1">{dm.detailRateLimitMinute}</label>
                <input
                  type="number"
                  value={reqPerMin}
                  onChange={(e) => setReqPerMin(Number(e.target.value))}
                  className="w-full bg-[var(--ds-bg)] border border-[var(--ds-border)] rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--ds-text-muted)] mb-1">{dm.detailRateLimitDay}</label>
                <input
                  type="number"
                  value={reqPerDay}
                  onChange={(e) => setReqPerDay(Number(e.target.value))}
                  className="w-full bg-[var(--ds-bg)] border border-[var(--ds-border)] rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {showReject ? (
            <div className="bg-[var(--ds-surface)] rounded-xl border border-red-500/30 p-4 mb-6">
              <div className="text-sm font-semibold text-red-400 mb-3">{dm.detailRejectReasonLabel}</div>
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={dm.detailRejectReasonPlaceholder}
                rows={4}
                className="w-full bg-[var(--ds-bg)] border border-[var(--ds-border)] rounded px-3 py-2 text-sm resize-y mb-3"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!reviewNote.trim() || reject.isPending}
                  onClick={() => reject.mutate({ id: r.id, reviewNote: reviewNote.trim() }, {
                    onSuccess: () => navigate("/developer/requests"),
                  })}
                  className="px-4 py-2 rounded bg-red-600 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {dm.detailRejectConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReject(false); setReviewNote(""); }}
                  className="px-4 py-2 rounded bg-[var(--ds-bg)] border border-[var(--ds-border)] text-sm"
                >
                  {dm.detailRejectCancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={approve.isPending}
                onClick={() => approve.mutate(
                  { id: r.id, requestsPerMinute: reqPerMin, requestsPerDay: reqPerDay },
                  { onSuccess: () => navigate("/developer/requests") },
                )}
                className="flex-1 py-2.5 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40"
              >
                {dm.detailApprove}
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className="flex-1 py-2.5 rounded bg-red-600 text-white text-sm font-semibold"
              >
                {dm.detailReject}
              </button>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

---

### Task 5: `ApiClientsPage` – Clients & Tokens

**Files:**
- Create: `apps/dashboard/src/features/developer/ApiClientsPage.tsx`

- [ ] **Step 1: Page-Komponente schreiben**

Pattern: `ServicesPage` (Cards, Status-Badges, Actions).

```tsx
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import {
  useApiAccessOverview,
  useCreateToken,
  useRevokeToken,
  useRotateToken,
} from "@/features/developer/hooks/useDeveloperData";
import { ApiClientStatus, ApiTokenStatus } from "@/features/developer/domain";

export function ApiClientsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const { data, isLoading } = useApiAccessOverview();
  const createToken = useCreateToken();
  const revokeToken = useRevokeToken();
  const rotateToken = useRotateToken();
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (raw: string) => {
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      [ApiClientStatus.Active]: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: dm.statusActive },
      [ApiClientStatus.Suspended]: { bg: "bg-amber-500/10", text: "text-amber-400", label: dm.statusSuspended },
      [ApiClientStatus.Revoked]: { bg: "bg-red-500/10", text: "text-red-400", label: dm.statusRevoked },
    };
    const s = map[status] ?? { bg: "bg-gray-500/10", text: "text-gray-400", label: status };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  return (
    <PageLayout>
      <PageHeader title={dm.clientsTitle} />

      {revealToken && (
        <div className="bg-[var(--ds-surface)] rounded-xl border border-emerald-500/30 p-5 mb-6 text-center">
          <div className="text-sm font-semibold text-amber-400 mb-1">{dm.tokenRevealTitle}</div>
          <div className="text-xs text-[var(--ds-text-muted)] mb-3">{dm.tokenRevealHint}</div>
          <div className="bg-[var(--ds-bg)] border border-emerald-500/20 rounded p-3 mb-3">
            <code className="text-xs text-emerald-400 break-all">{revealToken}</code>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(revealToken)}
            className="px-4 py-1.5 rounded bg-[var(--ds-accent)] text-black text-xs font-semibold"
          >
            {copied ? "Kopiert!" : dm.tokenRevealCopy}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      ) : (!data || data.clients.length === 0) ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{dm.clientsEmpty}</div>
      ) : (
        <div className="space-y-4">
          {data.clients.map((client) => (
            <div
              key={client.id}
              className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold">{client.appName}</h3>
                {statusBadge(client.status)}
                <span className="ml-auto text-xs text-[var(--ds-text-muted)]">{client.contactEmail}</span>
              </div>
              <div className="flex gap-4 text-xs text-[var(--ds-text-muted)] mb-4">
                <span>{client.requestsPerMinute}/min</span>
                <span>{client.requestsPerDay}/Tag</span>
              </div>
              <div className="border-t border-[var(--ds-border-subtle)] pt-3">
                <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
                  {dm.clientsTokensLabel}
                </div>
                {client.tokens.length === 0 ? (
                  <div className="text-xs text-[var(--ds-text-muted)]">{dm.clientsNoTokens}</div>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {client.tokens.map((token) => (
                      <div
                        key={token.id}
                        className="flex items-center gap-2 bg-[var(--ds-bg)] rounded px-3 py-2 text-xs"
                      >
                        <code className="text-[var(--ds-accent)]">{token.tokenPrefix}••••••••</code>
                        {token.status === ApiTokenStatus.Active && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">
                            Active
                          </span>
                        )}
                        <span className="ml-auto text-[var(--ds-text-muted)]">
                          {token.createdAt ? new Date(token.createdAt).toLocaleDateString("de-AT") : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => revokeToken.mutate(token.id)}
                          disabled={token.status !== ApiTokenStatus.Active || revokeToken.isPending}
                          className="px-2 py-0.5 rounded border border-[var(--ds-border)] text-[10px] text-[var(--ds-text-muted)] hover:text-red-400 disabled:opacity-30"
                        >
                          {dm.clientsRevokeToken}
                        </button>
                        <button
                          type="button"
                          onClick={() => rotateToken.mutate(token.id, {
                            onSuccess: (res) => setRevealToken(res.token.rawToken),
                          })}
                          disabled={token.status !== ApiTokenStatus.Active || rotateToken.isPending}
                          className="px-2 py-0.5 rounded border border-[var(--ds-border)] text-[10px] text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] disabled:opacity-30"
                        >
                          {dm.clientsRotateToken}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => createToken.mutate(client.id, {
                    onSuccess: (res) => setRevealToken(res.token.rawToken),
                  })}
                  disabled={createToken.isPending}
                  className="px-3 py-1 rounded bg-[var(--ds-accent)] text-black text-xs font-semibold disabled:opacity-40"
                >
                  {dm.clientsCreateToken}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

---

### Task 6: `DeveloperAccountsPage` – Developer-Accounts

**Files:**
- Create: `apps/dashboard/src/features/developer/DeveloperAccountsPage.tsx`

- [ ] **Step 1: Page-Komponente schreiben**

Pattern: `UsersPage`-Tabelle (read-only, Status-Badges).

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import { useDeveloperAccounts } from "@/features/developer/hooks/useDeveloperData";
import { DeveloperAccountStatus } from "@/features/developer/domain";

export function DeveloperAccountsPage() {
  const { messages } = useI18n();
  const dm = messages.developer;
  const { data, isLoading } = useDeveloperAccounts();

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      [DeveloperAccountStatus.Active]: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: dm.statusActive },
      [DeveloperAccountStatus.Suspended]: { bg: "bg-red-500/10", text: "text-red-400", label: dm.statusSuspended },
    };
    const s = map[status] ?? { bg: "bg-gray-500/10", text: "text-gray-400", label: status };
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  return (
    <PageLayout>
      <PageHeader title={dm.accountsTitle} />
      {isLoading ? (
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      ) : (
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--ds-border-subtle)] text-xs text-[var(--ds-text-muted)] uppercase tracking-wide">
                <th className="text-left p-3 font-medium">{dm.colEmail}</th>
                <th className="text-left p-3 font-medium">{dm.colDisplayName}</th>
                <th className="text-left p-3 font-medium">{dm.colPlan}</th>
                <th className="text-left p-3 font-medium">{dm.colClients}</th>
                <th className="text-left p-3 font-medium">{dm.colStatus}</th>
                <th className="text-left p-3 font-medium">{dm.colRegistered}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.accounts ?? []).map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[var(--ds-border-subtle)]"
                >
                  <td className="p-3 text-sm font-medium">{a.email}</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">{a.displayName ?? "—"}</td>
                  <td className="p-3 text-sm">{a.plan}</td>
                  <td className="p-3 text-sm">{a.clientCount}</td>
                  <td className="p-3">{statusBadge(a.status)}</td>
                  <td className="p-3 text-sm text-[var(--ds-text-muted)]">
                    {new Date(a.createdAt).toLocaleDateString("de-AT")}
                  </td>
                </tr>
              ))}
              {(!data || data.accounts.length === 0) && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-[var(--ds-text-muted)]">
                    Keine Developer Accounts
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </PageLayout>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

---

### Task 7: Overview-Stat-Card in DashboardPage

**Files:**
- Modify: `apps/dashboard/src/features/overview/DashboardPage.tsx`

- [ ] **Step 1: Stat-Card ins Grid einfügen**

Nach der Users-Card-Zeile:

```tsx
<DashboardInfoCard
  label={dm.cards.pendingApiAccessRequests}
  value={stats?.pendingApiAccessRequests ?? 0}
  accent
  href="/developer/requests"
/>
```

- [ ] **Step 2: Skeleton-Anzahl anpassen**

Das Skeleton-Array von 3 auf 4 erhöhen:

```tsx
{Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((key) => (
```

- [ ] **Step 3: i18n prüfen**

Der `cards.pendingApiAccessRequests`-Key wurde bereits in MC-090 (Step 5/6) angelegt. Typecheck bestätigt, dass er existiert.

- [ ] **Step 4: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

---

### Task 8: Routes + Lazy-Imports verdrahten

**Files:**
- Modify: `apps/dashboard/src/routes.tsx`
- Modify: `apps/dashboard/src/routeComponents.tsx`

- [ ] **Step 1: Lazy-Imports in `routeComponents.tsx`**

```tsx
export const ApiAccessRequestsPage = lazy(() =>
  import("@/features/developer/ApiAccessRequestsPage").then((m) => ({
    default: m.ApiAccessRequestsPage,
  })),
);

export const RequestDetailPage = lazy(() =>
  import("@/features/developer/RequestDetailPage").then((m) => ({
    default: m.RequestDetailPage,
  })),
);

export const ApiClientsPage = lazy(() =>
  import("@/features/developer/ApiClientsPage").then((m) => ({
    default: m.ApiClientsPage,
  })),
);

export const DeveloperAccountsPage = lazy(() =>
  import("@/features/developer/DeveloperAccountsPage").then((m) => ({
    default: m.DeveloperAccountsPage,
  })),
);
```

- [ ] **Step 2: Routes in `routes.tsx`**

In den `RequireNonModerator`-Block (nach der letzten bestehenden Route, vor `</Route>`):

```tsx
<Route path="developer/requests" element={lazyFallback(<ApiAccessRequestsPage />)} />
<Route path="developer/requests/:id" element={lazyFallback(<RequestDetailPage />)} />
<Route path="developer/clients" element={lazyFallback(<ApiClientsPage />)} />
<Route path="developer/accounts" element={lazyFallback(<DeveloperAccountsPage />)} />
```

- [ ] **Step 3: Imports in `routes.tsx` ergänzen**

Im Import-Block von `@/routeComponents` die neuen Komponenten hinzufügen:

```tsx
import {
  // ... existing imports ...
  ApiAccessRequestsPage,
  ApiClientsPage,
  DeveloperAccountsPage,
  RequestDetailPage,
} from "@/routeComponents";
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
```

Expected: keine Fehler.

---

### Task 9: Gates – React Doctor, Lint, Typecheck

- [ ] **Step 1: Biome-Format**

```bash
cd apps/dashboard && pnpm exec biome check --write src/features/developer/
```

- [ ] **Step 2: React Doctor diff**

```bash
cd apps/dashboard && pnpm run doctor:diff
```

Expected: 0 Issues. Falls domain-literals-Regel triggert: Status-Literale prüfen, ggf. Inline-Strings durch PascalCase-Namespace-Member ersetzen.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

- [ ] **Step 4: Typecheck (beide Apps)**

```bash
cd apps/dashboard && pnpm exec tsc --noEmit
cd apps/backend && pnpm exec tsc --noEmit
cd packages/shared && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Build**

```bash
cd apps/dashboard && pnpm build
```

Expected: Build erfolgreich.

- [ ] **Step 6: Test-Suite**

```bash
pnpm test:run
```

Expected: alle Tests grün.

---

### Task 10: Commit

- [ ] **Step 1: Commit**

```bash
git add -A
git commit -m "Feat: add developer management dashboard UI (MC-091)"
```

---

## Gates (vor Push)

- [ ] Biome: `pnpm lint` grün
- [ ] React Doctor: `pnpm run doctor:diff` 0 Issues
- [ ] Typecheck: `tsc --noEmit` grün (dashboard + backend + shared)
- [ ] Build: `pnpm build` (dashboard) grün
- [ ] Tests: `pnpm test:run` grün

## Verifizierte Fakten

- **Sidebar-Pattern**: `DashboardSection.Header` + `DashboardSection.Body` + `DashboardSection.Item` in `components/ui/DashboardSection.tsx:53`
- **Sidebar-Icons**: `KeyIcon`, `ClipboardTextIcon`, `PlugsConnectedIcon`, `UsersThreeIcon` existieren in `@phosphor-icons/react`
- **Page-Pattern**: `PageLayout` + `PageHeader` in `components/ui/PageLayout.tsx` / `PageHeader.tsx`
- **Table-Pattern**: `TracksPage` in `features/music/TracksPage.tsx` (Filter-Pills, Tabelle, useNavigate)
- **Detail-Pattern**: `TrackEditPage` in `features/music/TrackEditPage.tsx` (Back-Label, Info-Blöcke)
- **InfoCard-Pattern**: `DashboardInfoCard` in `components/ui/DashboardInfoCard.tsx` (`href`, `accent`-Props existieren)
- **Overview-Pattern**: `DashboardPage` in `features/overview/DashboardPage.tsx` (Grid, Skeleton)
- **API-Client**: `features/developer/api.ts` (MC-090), React-Query-Hooks in `hooks/useDeveloperData.ts`
- **Domain-Literale**: `features/developer/domain.ts` (MC-090), PascalCase-Namespaces
- **i18n**: `messages.developer.*` + `messages.layout.sidebar.sectionDeveloper` etc. (MC-090)
- **Routes**: `RequireNonModerator` in `features/auth/RequireNonModerator.tsx`
- **Lazy-Loading**: `routeComponents.tsx` Pattern mit `lazy(() => import(...).then(...))`
- **Plan-Nr.**: `plans next` → `MC-091`
