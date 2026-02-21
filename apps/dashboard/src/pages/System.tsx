import { useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";

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

// ─── Danger Zone ──────────────────────────────────────────────────────────────

type DangerPhase = "idle" | "fetching" | "confirm" | "resetting" | "done" | "error";

function DangerZone() {
  const [phase, setPhase] = useState<DangerPhase>("idle");
  const [counts, setCounts] = useState<{ tracks: number; albums: number } | null>(null);
  const [error, setError] = useState("");

  async function handleInitiate() {
    setPhase("fetching");
    setError("");
    try {
      const data = await apiGet<{ tracks: number; albums: number }>("/api/admin/data-counts");
      setCounts(data);
      setPhase("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden der Einträge.");
      setPhase("error");
    }
  }

  async function handleConfirm() {
    setPhase("resetting");
    try {
      const result = await apiPost<{ tracks: number; albums: number }>("/api/admin/reset-all");
      setCounts(result);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen.");
      setPhase("error");
    }
  }

  function handleCancel() {
    setPhase("idle");
    setCounts(null);
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-1 text-destructive">Danger Zone</h2>
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4">
        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0">
            <p className="font-medium text-sm">Alle Daten löschen</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Löscht alle Tracks, Alben, Links, Short-URLs und Caches. User-Accounts bleiben unberührt.
            </p>
            {phase === "confirm" && counts && (
              <p className="text-xs text-destructive mt-2 font-medium">
                {counts.tracks} {counts.tracks === 1 ? "Track" : "Tracks"} und{" "}
                {counts.albums} {counts.albums === 1 ? "Album" : "Alben"} werden unwiderruflich gelöscht.
              </p>
            )}
            {phase === "done" && counts && (
              <p className="text-xs text-green-500 mt-1">
                {counts.tracks} {counts.tracks === 1 ? "Track" : "Tracks"} und{" "}
                {counts.albums} {counts.albums === 1 ? "Album" : "Alben"} wurden gelöscht.
              </p>
            )}
            {phase === "error" && (
              <p className="text-xs text-destructive mt-1">{error}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-none mt-0.5">
            {(phase === "idle" || phase === "error") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInitiate}
                className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                Zurücksetzen…
              </Button>
            )}
            {phase === "fetching" && (
              <Button variant="outline" size="sm" disabled>
                …
              </Button>
            )}
            {phase === "confirm" && (
              <>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Abbrechen
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Ja, alles löschen
                </Button>
              </>
            )}
            {phase === "resetting" && (
              <Button size="sm" disabled className="bg-destructive/70 text-destructive-foreground">
                Löscht…
              </Button>
            )}
            {phase === "done" && (
              <Button variant="outline" size="sm" onClick={() => setPhase("idle")}>
                OK
              </Button>
            )}
          </div>
        </div>
      </div>
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

      <DangerZone />
    </div>
  );
}
