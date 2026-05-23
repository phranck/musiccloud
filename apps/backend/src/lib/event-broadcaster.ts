export interface TypedEvent<TType extends string, TData extends object> {
  type: TType;
  data: TData;
}

export type AdminEventType =
  | "track-added"
  | "tracks-deleted"
  | "album-added"
  | "albums-deleted"
  | "artist-added"
  | "artists-deleted";

export type AdminEvent = TypedEvent<AdminEventType, Record<string, unknown>>;

export type WebsiteAnalyticsRealtimeActivity =
  | "page_view"
  | "search"
  | "resolve"
  | "listen"
  | "player"
  | "interaction"
  | "bot";

export interface WebsiteAnalyticsRealtimeEventData {
  id: string;
  occurredAt: string;
  eventType: string;
  activity: WebsiteAnalyticsRealtimeActivity;
  latitude: number;
  longitude: number;
  accuracyRadiusKm: number | null;
  countryCode: string | null;
  regionCode: string | null;
  regionName: string | null;
  city: string | null;
  path: string | null;
  routeTemplate: string | null;
  surface: string | null;
  elementKey: string | null;
  deviceClass: string | null;
  isBot: boolean;
}

export type WebsiteAnalyticsRealtimeEvent = TypedEvent<"website-analytics-geo-event", WebsiteAnalyticsRealtimeEventData>;

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
      } catch {}
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

/** Singleton broadcaster for admin dashboard live events. */
export const adminEventBroadcaster = new EventBroadcaster<AdminEvent>();

/** Singleton broadcaster for realtime website analytics Geo-IP points. */
export const websiteAnalyticsRealtimeBroadcaster = new EventBroadcaster<WebsiteAnalyticsRealtimeEvent>();
