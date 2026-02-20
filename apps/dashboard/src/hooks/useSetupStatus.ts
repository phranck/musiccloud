import { useEffect, useState } from "react";

interface SetupStatusState {
  checking: boolean;
  setupRequired: boolean | null;
  error: boolean;
}

/**
 * Fetches /api/admin/auth/setup-status once on mount.
 * Cancels the in-flight request when the component unmounts.
 * Times out after 5 seconds.
 *
 * @param skip - When true, skips the fetch and returns checking: false immediately.
 */
export function useSetupStatus(skip = false): SetupStatusState {
  const [state, setState] = useState<SetupStatusState>({
    checking: !skip,
    setupRequired: null,
    error: false,
  });

  useEffect(() => {
    if (skip) {
      setState({ checking: false, setupRequired: null, error: false });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch("/api/admin/auth/setup-status", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { setupRequired: boolean }) => {
        setState({ checking: false, setupRequired: data.setupRequired, error: false });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ checking: false, setupRequired: null, error: true });
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [skip]);

  return state;
}
