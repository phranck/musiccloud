import type { AdminEvent } from "@musiccloud/shared";

import { log } from "./infra/logger.js";

export interface TypedEvent<TType extends string, TData extends object> {
  type: TType;
  data: TData;
}

type Listener<TEvent> = (event: TEvent) => void;

class EventBroadcaster<TEvent extends TypedEvent<string, object>> {
  private listeners = new Set<Listener<TEvent>>();

  subscribe(fn: Listener<TEvent>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: TEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch (error) {
        // A broken listener must not prevent delivery to other subscribers.
        log.deviation(
          {
            component: "EventBroadcaster",
            errorCode: "MC-SYS-0001",
            eventType: event.type,
            operation: "admin_event_delivery",
            outcome: "remaining_listeners_continue",
          },
          error,
        );
      }
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/**
 * Singleton broadcaster for admin dashboard live events. Its event names and
 * payloads are the shared `AdminEvent`, which the dashboard reads with the
 * same definition.
 */
export const adminEventBroadcaster = new EventBroadcaster<AdminEvent>();
