import { type AdminEvent, ENDPOINTS, isAdminEvent } from "@musiccloud/shared";
import { useEffect, useRef } from "react";

function getToken(): string | null {
  try {
    const stored = localStorage.getItem("admin_token");
    if (!stored) return null;
    const { token } = JSON.parse(stored) as { token: string };
    return token ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribes to admin SSE events from /api/admin/events.
 *
 * Uses fetch + ReadableStream instead of EventSource so that the
 * Authorization header can be sent (EventSource does not support headers).
 *
 * Only events the shared `AdminEventType` defines, with a payload of the
 * right shape, reach `onEvent`. Anything else on the stream is dropped.
 *
 * Reconnects automatically after 3 s on error or server-side close.
 */
export function useAdminSSE(onEvent: (event: AdminEvent) => void): void {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let active = true;
    let controller = new AbortController();

    async function connect() {
      controller = new AbortController();
      try {
        const res = await fetch(ENDPOINTS.admin.events, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          if (active) setTimeout(connect, 3000);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "";
        let eventData = "";

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6).trim();
            } else if (line === "" && eventType && eventData) {
              try {
                const data: unknown = JSON.parse(eventData);
                if (isAdminEvent(eventType, data)) {
                  onEventRef.current({ type: eventType, data } as AdminEvent);
                }
              } catch {}
              eventType = "";
              eventData = "";
            }
          }
        }
      } catch {
        // Aborted or network error
      }

      if (active) setTimeout(connect, 3000);
    }

    connect();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);
}
