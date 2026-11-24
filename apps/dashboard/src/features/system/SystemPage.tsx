import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButton,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { ENDPOINTS } from "@musiccloud/shared";
import { useEffect, useState } from "react";

import { dashboardCopy } from "@/copy/dashboard";
import { api } from "@/lib/api";

interface ClearResult {
  deleted: number;
}

const ActionState = {
  Idle: "idle",
  Loading: "loading",
  Success: "success",
  Error: "error",
} as const;

type ActionState = (typeof ActionState)[keyof typeof ActionState];

function CacheAction<T = ClearResult>({
  label,
  description,
  buttonLabel,
  endpoint,
  formatSuccess,
}: {
  label: string;
  description: string;
  buttonLabel: string;
  endpoint: string;
  /** Turn the API response into the success message. Defaults to `${messages.system.entriesDeleted}` using `{count}` from `(result as ClearResult).deleted`. */
  formatSuccess?: (result: T) => string;
}) {
  const messages = dashboardCopy;
  const [state, setState] = useState<ActionState>(ActionState.Idle);
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState(ActionState.Loading);
    setMessage("");
    try {
      const result = await api.post<T>(endpoint);
      setState(ActionState.Success);
      if (formatSuccess) {
        setMessage(formatSuccess(result));
      } else {
        const deleted = (result as unknown as ClearResult).deleted ?? 0;
        setMessage(messages.system.entriesDeleted.replace("{count}", String(deleted)));
      }
    } catch (err) {
      setState(ActionState.Error);
      setMessage(err instanceof Error ? err.message : messages.common.unknownError);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-[var(--ds-border)] last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-sm text-[var(--ds-text)]">{label}</p>
        <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{description}</p>
        {message && (
          <p
            className={`text-xs mt-1 ${state === ActionState.Error ? "text-[var(--ds-danger-text)]" : "text-green-500"}`}
          >
            {message}
          </p>
        )}
      </div>
      <DashboardButton
        type="button"
        onClick={handleClick}
        disabled={state === ActionState.Loading}
        className="flex-none"
        size="action"
        variant={DashboardButtonVariant.Neutral}
      >
        {state === ActionState.Loading ? "…" : buttonLabel}
      </DashboardButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracking Toggle
// ---------------------------------------------------------------------------

function TrackingToggle() {
  const messages = dashboardCopy;
  const m = messages.system;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Record<string, string>>(ENDPOINTS.admin.siteSettings.base)
      .then((settings) => setEnabled(settings.tracking_enabled === "true"))
      .catch(() => setEnabled(true));
  }, []);

  async function handleToggle() {
    if (enabled === null) return;
    const newValue = !enabled;
    setSaving(true);
    try {
      await api.patch(ENDPOINTS.admin.siteSettings.base, { tracking_enabled: String(newValue) });
      setEnabled(newValue);
    } catch {
      // revert on error
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) return null;

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-medium text-sm text-[var(--ds-text)]">{m.trackingLabel}</p>
        <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{m.trackingDescription}</p>
      </div>
      <DashboardButton
        type="button"
        onClick={handleToggle}
        disabled={saving}
        className="flex-none"
        size="action"
        variant={enabled ? DashboardButtonVariant.Success : DashboardButtonVariant.Neutral}
      >
        {enabled ? m.trackingEnabled : m.trackingDisabled}
      </DashboardButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone
// ---------------------------------------------------------------------------

const DangerPhase = {
  Idle: "idle",
  Fetching: "fetching",
  Confirm: "confirm",
  Resetting: "resetting",
  Done: "done",
  Error: "error",
} as const;

type DangerPhase = (typeof DangerPhase)[keyof typeof DangerPhase];

/**
 * The count that takes the singular label. Every other count, zero included,
 * takes the plural, as English does.
 */
const SINGULAR_COUNT = 1;

/**
 * How many tracks and albums the stored music data holds, as the data counts
 * and reset endpoints report it.
 *
 * @property tracks - The number of stored tracks, zero or more.
 * @property albums - The number of stored albums, zero or more.
 */
interface DataCounts {
  tracks: number;
  albums: number;
}

/**
 * Picks the singular or the plural label for a count.
 *
 * @param count - The number of items being named.
 * @param singular - The label for exactly `SINGULAR_COUNT` item, such as `Album`.
 * @param plural - The label for every other count, such as `Albums`.
 * @returns `singular` when `count` equals `SINGULAR_COUNT`, otherwise `plural`.
 */
function countLabel(count: number, singular: string, plural: string): string {
  return count === SINGULAR_COUNT ? singular : plural;
}

/**
 * Fills a Danger Zone template with the track and album counts and the label
 * that fits each count. The template uses the placeholders `{tracks}`,
 * `{tracksLabel}`, `{albums}` and `{albumsLabel}`, as
 * `dashboardCopy.system.deleteAllDescriptionWithCounts` and
 * `dashboardCopy.system.deleteAllSuccess` do.
 *
 * @param template - The copy string whose placeholders are replaced.
 * @param counts - The track and album counts to write into it.
 * @returns The template with every placeholder replaced.
 */
function formatDataCounts(template: string, counts: DataCounts): string {
  const copy = dashboardCopy.system;
  return template
    .replace("{tracks}", String(counts.tracks))
    .replace("{tracksLabel}", countLabel(counts.tracks, copy.trackLabel, copy.tracksLabel))
    .replace("{albums}", String(counts.albums))
    .replace("{albumsLabel}", countLabel(counts.albums, copy.albumLabel, copy.albumsLabel));
}

function DangerZone() {
  const messages = dashboardCopy;
  const m = messages.system;
  const [phase, setPhase] = useState<DangerPhase>(DangerPhase.Idle);
  const [counts, setCounts] = useState<DataCounts | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<DataCounts>(ENDPOINTS.admin.dataCounts)
      .then(setCounts)
      .catch(() => {});
  }, []);

  function formatDescription() {
    if (!counts) return m.deleteAllDescriptionGeneric;
    return formatDataCounts(m.deleteAllDescriptionWithCounts, counts);
  }

  async function handleInitiate() {
    setPhase(DangerPhase.Fetching);
    setError("");
    try {
      const data = await api.get<DataCounts>(ENDPOINTS.admin.dataCounts);
      setCounts(data);
      setPhase(DangerPhase.Confirm);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.unknownError);
      setPhase(DangerPhase.Error);
    }
  }

  async function handleConfirm() {
    setPhase(DangerPhase.Resetting);
    try {
      const result = await api.post<DataCounts>(ENDPOINTS.admin.resetAll);
      setCounts(result);
      setPhase(DangerPhase.Done);
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.unknownError);
      setPhase(DangerPhase.Error);
    }
  }

  function handleCancel() {
    setPhase(DangerPhase.Idle);
    setCounts(null);
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-1 text-[var(--ds-danger-text)]">{m.dangerZoneTitle}</h2>
      <div className="rounded-lg border border-[var(--ds-danger-border)] bg-[var(--ds-danger-bg)]/5 px-4">
        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-medium text-sm text-[var(--ds-text)]">{m.deleteAllLabel}</p>
            <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{formatDescription()}</p>
            {phase === DangerPhase.Confirm && (
              <p className="text-xs text-[var(--ds-danger-text)] mt-2 font-medium">{m.deleteAllIrreversible}</p>
            )}
            {phase === DangerPhase.Done && counts && (
              <p className="text-xs text-green-500 mt-1">{formatDataCounts(m.deleteAllSuccess, counts)}</p>
            )}
            {phase === DangerPhase.Error && <p className="text-xs text-[var(--ds-danger-text)] mt-1">{error}</p>}
          </div>

          <div className="flex items-center gap-2 flex-none mt-0.5">
            {(phase === DangerPhase.Idle || phase === DangerPhase.Error) && (
              <DashboardActionButton
                action={DashboardActionId.Delete}
                icon={false}
                label={m.deleteAllButton}
                onClick={handleInitiate}
                type="button"
              />
            )}
            {phase === DangerPhase.Fetching && (
              <DashboardActionButton
                action={DashboardActionId.Delete}
                busyLabel="…"
                icon={false}
                status={DashboardActionStatus.Busy}
                type="button"
              />
            )}
            {phase === DangerPhase.Confirm && (
              <>
                <DashboardActionButton
                  action={DashboardActionId.Cancel}
                  icon={false}
                  label={messages.common.cancel}
                  onClick={handleCancel}
                  type="button"
                  variant={DashboardButtonVariant.Neutral}
                />
                <DashboardActionButton
                  action={DashboardActionId.Delete}
                  icon={false}
                  label={m.deleteAllConfirm}
                  onClick={handleConfirm}
                  type="button"
                />
              </>
            )}
            {phase === DangerPhase.Resetting && (
              <DashboardActionButton
                action={DashboardActionId.Delete}
                busyLabel="…"
                icon={false}
                status={DashboardActionStatus.Busy}
                type="button"
              />
            )}
            {phase === DangerPhase.Done && (
              <DashboardButton
                type="button"
                onClick={() => setPhase(DangerPhase.Idle)}
                size="action"
                variant={DashboardButtonVariant.Neutral}
              >
                {messages.common.ok}
              </DashboardButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SystemPage() {
  const messages = dashboardCopy;
  const m = messages.system;

  return (
    <div className="grid gap-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold mb-1 text-[var(--ds-text)]">{m.trackingTitle}</h2>
        <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
          <TrackingToggle />
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-1 text-[var(--ds-text)]">{m.cacheTitle}</h2>
        <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
          <CacheAction
            label={m.artistCacheLabel}
            description={m.artistCacheDescription}
            buttonLabel={m.artistCacheClear}
            endpoint={ENDPOINTS.admin.cache.artistClear}
          />
          <CacheAction<{ tracks: number; albums: number; artists: number }>
            label={m.shareCacheLabel}
            description={m.shareCacheDescription}
            buttonLabel={m.shareCacheClear}
            endpoint={ENDPOINTS.admin.cache.invalidateAll}
            formatSuccess={(r) =>
              m.shareCacheSuccess
                .replace("{tracks}", String(r.tracks))
                .replace("{albums}", String(r.albums))
                .replace("{artists}", String(r.artists))
            }
          />
          <CacheAction
            label={m.genreCacheLabel}
            description={m.genreCacheDescription}
            buttonLabel={m.genreCacheClear}
            endpoint={ENDPOINTS.admin.cache.genreClear}
          />
        </div>
      </div>

      <DangerZone />
    </div>
  );
}
