import { useState } from "react";
import { apiPost } from "@/lib/api";
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
    </div>
  );
}
