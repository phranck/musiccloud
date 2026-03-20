import { useEffect, useState } from "react";

import { useI18n } from "@/context/I18nContext";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Qobuz API Diagnostics
// ---------------------------------------------------------------------------

interface QobuzDiagResult {
  name: string;
  status: number;
  ok: boolean;
  bodyPreview?: string;
  error?: string;
}

interface QobuzDiagResponse {
  appId: string;
  env: { QOBUZ_APP_ID: string };
  results: QobuzDiagResult[];
}

function QobuzDiagnostics() {
  const { messages } = useI18n();
  const m = messages.system;
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [data, setData] = useState<QobuzDiagResponse | null>(null);
  const [error, setError] = useState("");

  async function handleRun() {
    setState("loading");
    setError("");
    try {
      const result = await api.get<QobuzDiagResponse>("/admin/qobuz-diag");
      setData(result);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-1 text-[var(--ds-text)]">{m.qobuzDiagTitle}</h2>
      <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
        <div className="flex items-start justify-between gap-4 py-4 border-b border-[var(--ds-border)]">
          <div className="min-w-0">
            <p className="text-xs text-[var(--ds-text-muted)]">{m.qobuzDiagDescription}</p>
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={state === "loading"}
            className="flex-none h-8 px-3 rounded-md text-sm font-medium border border-[var(--ds-border)] text-[var(--ds-text)] hover:border-[var(--ds-border-strong)] transition-colors disabled:opacity-50"
          >
            {state === "loading" ? m.qobuzDiagRunning : m.qobuzDiagRun}
          </button>
        </div>

        {state === "error" && <p className="text-xs text-[var(--ds-btn-danger-text)] py-3">{error}</p>}

        {data && (
          <div className="py-3 space-y-3">
            <div className="flex gap-4 text-xs">
              <span className="text-[var(--ds-text-muted)]">
                {m.qobuzDiagAppId}: <code className="text-[var(--ds-text)]">{data.appId}</code>
              </span>
              <span className="text-[var(--ds-text-muted)]">
                {m.qobuzDiagEnvVar}:{" "}
                <code
                  className={data.env.QOBUZ_APP_ID === "set" ? "text-green-500" : "text-[var(--ds-btn-danger-text)]"}
                >
                  {data.env.QOBUZ_APP_ID === "set" ? m.qobuzDiagSet : m.qobuzDiagNotSet}
                </code>
              </span>
            </div>

            <div className="space-y-1">
              {data.results.map((r) => (
                <div key={r.name} className="rounded border border-[var(--ds-border)] p-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`inline-block w-2 h-2 rounded-full ${r.ok ? "bg-green-500" : "bg-red-500"}`} />
                    <span className="font-medium text-[var(--ds-text)]">{r.name}</span>
                    <span className="text-[var(--ds-text-muted)]">HTTP {r.status}</span>
                  </div>
                  {r.error && <p className="text-xs text-[var(--ds-btn-danger-text)] mt-1">{r.error}</p>}
                  {r.bodyPreview && (
                    <pre className="text-[10px] text-[var(--ds-text-muted)] mt-1 overflow-x-auto whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
                      {r.bodyPreview}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ClearResult {
  deleted: number;
}

type ActionState = "idle" | "loading" | "success" | "error";

function CacheAction({
  label,
  description,
  buttonLabel,
  endpoint,
}: {
  label: string;
  description: string;
  buttonLabel: string;
  endpoint: string;
}) {
  const { messages } = useI18n();
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("loading");
    setMessage("");
    try {
      const result = await api.post<ClearResult>(endpoint);
      setState("success");
      setMessage(messages.system.entriesDeleted.replace("{count}", String(result.deleted)));
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
      .get<{ tracks: number; albums: number }>("/admin/data-counts")
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
      const data = await api.get<{ tracks: number; albums: number }>("/admin/data-counts");
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
      const result = await api.post<{ tracks: number; albums: number }>("/admin/reset-all");
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
        <h2 className="text-base font-semibold mb-1 text-[var(--ds-text)]">{m.cacheTitle}</h2>
        <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
          <CacheAction
            label={m.artistCacheLabel}
            description={m.artistCacheDescription}
            buttonLabel={m.artistCacheClear}
            endpoint="/admin/artist-cache/clear"
          />
        </div>
      </div>

      <QobuzDiagnostics />

      <DangerZone />
    </div>
  );
}
