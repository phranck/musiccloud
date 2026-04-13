import { ENDPOINTS } from "@musiccloud/shared";
import { useEffect, useState } from "react";

import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";

interface ClearResult {
  deleted: number;
}

type ActionState = "idle" | "loading" | "success" | "error";

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
  const { messages } = useI18n();
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("loading");
    setMessage("");
    try {
      const result = await api.post<T>(endpoint);
      setState("success");
      if (formatSuccess) {
        setMessage(formatSuccess(result));
      } else {
        const deleted = (result as unknown as ClearResult).deleted ?? 0;
        setMessage(messages.system.entriesDeleted.replace("{count}", String(deleted)));
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : messages.common.unknownError);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-[var(--ds-border)] last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-sm text-[var(--ds-text)]">{label}</p>
        <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{description}</p>
        {message && (
          <p className={`text-xs mt-1 ${state === "error" ? "text-[var(--ds-btn-danger-text)]" : "text-green-500"}`}>
            {message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={state === "loading"}
        className="flex-none h-8 px-3 rounded-md text-sm font-medium border border-[var(--ds-border)] text-[var(--ds-text)] hover:border-[var(--ds-border-strong)] transition-colors disabled:opacity-50"
      >
        {state === "loading" ? "\u2026" : buttonLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracking Toggle
// ---------------------------------------------------------------------------

function TrackingToggle() {
  const { messages } = useI18n();
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
      <button
        type="button"
        onClick={handleToggle}
        disabled={saving}
        className={`flex-none h-8 px-3 rounded-md text-sm font-medium border transition-colors disabled:opacity-50 ${
          enabled
            ? "border-green-500/30 text-green-500 hover:bg-green-500/10"
            : "border-[var(--ds-border)] text-[var(--ds-text-muted)] hover:border-[var(--ds-border-strong)]"
        }`}
      >
        {enabled ? m.trackingEnabled : m.trackingDisabled}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger Zone
// ---------------------------------------------------------------------------

type DangerPhase = "idle" | "fetching" | "confirm" | "resetting" | "done" | "error";

function DangerZone() {
  const { messages } = useI18n();
  const m = messages.system;
  const [phase, setPhase] = useState<DangerPhase>("idle");
  const [counts, setCounts] = useState<{ tracks: number; albums: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<{ tracks: number; albums: number }>(ENDPOINTS.admin.dataCounts)
      .then(setCounts)
      .catch(() => {});
  }, []);

  function tracksLabel(n: number) {
    return n === 1 ? "Track" : "Tracks";
  }

  function albumsLabel(n: number) {
    return n === 1 ? "Album" : "Alben";
  }

  function formatDescription() {
    if (!counts) return m.deleteAllDescriptionGeneric;
    return m.deleteAllDescriptionWithCounts
      .replace("{tracks}", String(counts.tracks))
      .replace("{tracksLabel}", tracksLabel(counts.tracks))
      .replace("{albums}", String(counts.albums))
      .replace("{albumsLabel}", albumsLabel(counts.albums));
  }

  async function handleInitiate() {
    setPhase("fetching");
    setError("");
    try {
      const data = await api.get<{ tracks: number; albums: number }>(ENDPOINTS.admin.dataCounts);
      setCounts(data);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.unknownError);
      setPhase("error");
    }
  }

  async function handleConfirm() {
    setPhase("resetting");
    try {
      const result = await api.post<{ tracks: number; albums: number }>(ENDPOINTS.admin.resetAll);
      setCounts(result);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.common.unknownError);
      setPhase("error");
    }
  }

  function handleCancel() {
    setPhase("idle");
    setCounts(null);
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-1 text-[var(--ds-btn-danger-text)]">{m.dangerZoneTitle}</h2>
      <div className="rounded-lg border border-[var(--ds-btn-danger-border)] bg-[var(--ds-btn-danger-bg)]/5 px-4">
        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-medium text-sm text-[var(--ds-text)]">{m.deleteAllLabel}</p>
            <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{formatDescription()}</p>
            {phase === "confirm" && (
              <p className="text-xs text-[var(--ds-btn-danger-text)] mt-2 font-medium">{m.deleteAllIrreversible}</p>
            )}
            {phase === "done" && counts && (
              <p className="text-xs text-green-500 mt-1">
                {m.deleteAllSuccess
                  .replace("{tracks}", String(counts.tracks))
                  .replace("{tracksLabel}", tracksLabel(counts.tracks))
                  .replace("{albums}", String(counts.albums))
                  .replace("{albumsLabel}", albumsLabel(counts.albums))}
              </p>
            )}
            {phase === "error" && <p className="text-xs text-[var(--ds-btn-danger-text)] mt-1">{error}</p>}
          </div>

          <div className="flex items-center gap-2 flex-none mt-0.5">
            {(phase === "idle" || phase === "error") && (
              <button
                type="button"
                onClick={handleInitiate}
                className="h-8 px-3 rounded-md text-sm font-medium border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] hover:bg-[var(--ds-btn-danger-hover-bg)] transition-colors"
              >
                {m.deleteAllButton}
              </button>
            )}
            {phase === "fetching" && (
              <button
                type="button"
                disabled
                className="h-8 px-3 rounded-md text-sm border border-[var(--ds-border)] opacity-50"
              >
                &hellip;
              </button>
            )}
            {phase === "confirm" && (
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="h-8 px-3 rounded-md text-sm font-medium border border-[var(--ds-border)] text-[var(--ds-text)] hover:border-[var(--ds-border-strong)] transition-colors"
                >
                  {m.deleteAllCancel}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="h-8 px-3 rounded-md text-sm font-medium bg-[var(--ds-btn-danger-bg)] text-white hover:bg-[var(--ds-btn-danger-hover-bg)] transition-colors"
                >
                  {m.deleteAllConfirm}
                </button>
              </>
            )}
            {phase === "resetting" && (
              <button
                type="button"
                disabled
                className="h-8 px-3 rounded-md text-sm font-medium bg-[var(--ds-btn-danger-bg)]/70 text-white opacity-70"
              >
                &hellip;
              </button>
            )}
            {phase === "done" && (
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="h-8 px-3 rounded-md text-sm font-medium border border-[var(--ds-border)] text-[var(--ds-text)] hover:border-[var(--ds-border-strong)] transition-colors"
              >
                OK
              </button>
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
  const { messages } = useI18n();
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
        </div>
      </div>

      <DangerZone />
    </div>
  );
}
