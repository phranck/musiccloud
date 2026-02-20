import { useState, useEffect, useReducer, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import type { SSEEvent } from "@/hooks/useAdminSSE";

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
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("loading");
    setMessage("");
    try {
      const result = await apiPost<ClearResult>(endpoint);
      setState("success");
      setMessage(`${result.deleted} Einträge gelöscht.`);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {message && (
          <p className={`text-xs mt-1 ${state === "error" ? "text-destructive" : "text-green-500"}`}>
            {message}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={state === "loading"}
        className="flex-none"
      >
        {state === "loading" ? "..." : buttonLabel}
      </Button>
    </div>
  );
}

// ─── Preview URL Backfill ────────────────────────────────────────────────────

type BackfillState =
  | { phase: "checking" }
  | { phase: "ready"; missing: number }
  | { phase: "running"; processed: number; total: number }
  | { phase: "done"; updated: number; total: number }
  | { phase: "error"; message: string };

type BackfillAction =
  | { type: "loaded"; missing: number }
  | { type: "started"; total: number }
  | { type: "progress"; processed: number; total: number }
  | { type: "done"; updated: number; total: number }
  | { type: "error"; message: string }
  | { type: "reset" };

function backfillReducer(_: BackfillState, action: BackfillAction): BackfillState {
  switch (action.type) {
    case "loaded":
      return { phase: "ready", missing: action.missing };
    case "started":
      return { phase: "running", processed: 0, total: action.total };
    case "progress":
      return { phase: "running", processed: action.processed, total: action.total };
    case "done":
      return { phase: "done", updated: action.updated, total: action.total };
    case "error":
      return { phase: "error", message: action.message };
    case "reset":
      return { phase: "checking" };
    default:
      return _;
  }
}

function PreviewUrlBackfillCard() {
  const [state, dispatch] = useReducer(backfillReducer, { phase: "checking" });

  useEffect(() => {
    let cancelled = false;
    apiGet<{ missing: number; isRunning: boolean }>("/api/admin/backfill/preview-urls/status")
      .then((data) => {
        if (cancelled) return;
        if (data.isRunning) {
          dispatch({ type: "started", total: 0 });
        } else {
          dispatch({ type: "loaded", missing: data.missing });
        }
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "error", message: "Status konnte nicht geladen werden." });
      });
    return () => { cancelled = true; };
  }, []);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.type === "backfill:started") {
      dispatch({ type: "started", total: (event.data.total as number) ?? 0 });
    } else if (event.type === "backfill:progress") {
      dispatch({
        type: "progress",
        processed: (event.data.processed as number) ?? 0,
        total: (event.data.total as number) ?? 0,
      });
    } else if (event.type === "backfill:done") {
      dispatch({
        type: "done",
        updated: (event.data.updated as number) ?? 0,
        total: (event.data.total as number) ?? 0,
      });
    } else if (event.type === "backfill:error") {
      dispatch({ type: "error", message: (event.data.message as string) ?? "Unbekannter Fehler" });
    }
  }, []);

  useAdminSSE(handleSSEEvent);

  async function handleStart() {
    const token = localStorage.getItem("admin_token");
    let authHeader = "";
    try {
      const { token: t } = JSON.parse(token ?? "{}") as { token?: string };
      if (t) authHeader = `Bearer ${t}`;
    } catch {}

    const res = await fetch("/api/admin/backfill/preview-urls/start", {
      method: "POST",
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    if (res.status === 409) return; // already running – SSE will update state
    if (!res.ok) dispatch({ type: "error", message: `Fehler: ${res.status}` });
  }

  async function handleReset() {
    dispatch({ type: "reset" });
    try {
      const data = await apiGet<{ missing: number; isRunning: boolean }>(
        "/api/admin/backfill/preview-urls/status",
      );
      dispatch({ type: "loaded", missing: data.missing });
    } catch {
      dispatch({ type: "error", message: "Status konnte nicht geladen werden." });
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">Preview URLs nachfüllen</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Holt fehlende 30s-Previews von Deezer oder Spotify nach.
        </p>

        {state.phase === "checking" && (
          <p className="text-xs text-muted-foreground mt-2">Prüfe Datenbank…</p>
        )}

        {state.phase === "ready" && (
          <p className="text-xs text-muted-foreground mt-2">
            {state.missing === 0
              ? "Alle Tracks haben eine Preview URL."
              : `${state.missing} Track${state.missing !== 1 ? "s" : ""} ohne Preview URL.`}
          </p>
        )}

        {state.phase === "running" && (
          <p className="text-xs text-muted-foreground mt-2">
            {state.total > 0
              ? `${state.processed} / ${state.total} verarbeitet…`
              : "Starte…"}
          </p>
        )}

        {state.phase === "done" && (
          <p className="text-xs text-green-500 mt-2">
            Fertig — {state.updated} neue Preview{state.updated !== 1 ? "s" : ""} gefunden
            {state.total > 0 ? ` (${state.total} geprüft).` : "."}
          </p>
        )}

        {state.phase === "error" && (
          <p className="text-xs text-destructive mt-2">{state.message}</p>
        )}
      </div>

      {state.phase === "checking" && (
        <Button variant="outline" size="sm" disabled className="flex-none">
          …
        </Button>
      )}

      {state.phase === "ready" && state.missing > 0 && (
        <Button variant="outline" size="sm" onClick={handleStart} className="flex-none">
          Starten
        </Button>
      )}

      {state.phase === "running" && (
        <Button variant="outline" size="sm" disabled className="flex-none">
          Läuft…
        </Button>
      )}

      {(state.phase === "done" || state.phase === "error" || (state.phase === "ready" && state.missing === 0)) && (
        <Button variant="outline" size="sm" onClick={handleReset} className="flex-none">
          Erneut prüfen
        </Button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function System() {
  return (
    <div className="grid gap-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold mb-1">Cache</h2>
        <div className="rounded-lg border bg-card px-4">
          <CacheAction
            label="Artist-Cache leeren"
            description="Löscht alle gecachten Artist-Infos (Top-Tracks, Profil, Tourdaten). Werden beim nächsten Aufruf neu geladen."
            buttonLabel="Leeren"
            endpoint="/api/admin/artist-cache/clear"
          />
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-1">Daten-Qualität</h2>
        <div className="rounded-lg border bg-card px-4">
          <PreviewUrlBackfillCard />
        </div>
      </div>
    </div>
  );
}
