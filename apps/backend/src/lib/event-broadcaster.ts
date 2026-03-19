export type AdminEventType = "track-added" | "tracks-deleted" | "album-added" | "albums-deleted";

export interface AdminEvent {
  type: AdminEventType;
  data: Record<string, unknown>;
}

type Listener = (event: AdminEvent) => void;

class EventBroadcaster {
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event: AdminEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {}
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Singleton broadcaster for admin dashboard live events. */
export const adminEventBroadcaster = new EventBroadcaster();
