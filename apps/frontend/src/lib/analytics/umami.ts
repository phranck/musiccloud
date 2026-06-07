type UmamiPropertyValue = string | number | boolean;
type UmamiProperties = Record<string, UmamiPropertyValue>;

type UmamiClient = {
  track: (eventName: string, properties?: UmamiProperties) => void | Promise<void>;
};

type MusicSignalEvent =
  | "music_source_search_success"
  | "music_search_submitted"
  | "music_interaction"
  | "music_service_link_click"
  | "music_preview_interaction"
  | "music_share_interaction";

type MusicSignalProperties = Record<string, UmamiPropertyValue | null | undefined>;

declare global {
  interface Window {
    umami?: UmamiClient;
  }
}

function cleanProperties(properties: MusicSignalProperties | undefined): UmamiProperties | undefined {
  if (!properties) return undefined;

  const entries = Object.entries(properties).filter(
    (entry): entry is [string, UmamiPropertyValue] => entry[1] !== undefined && entry[1] !== null && entry[1] !== "",
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function sendMusicSignal(eventName: MusicSignalEvent, properties?: MusicSignalProperties): void {
  if (typeof window === "undefined") return;
  const umami = window.umami;
  if (!umami || typeof umami.track !== "function") return;

  try {
    void umami.track(eventName, cleanProperties(properties));
  } catch {
    // Analytics must never affect the product flow.
  }
}

export function classifySearchInput(input: string): "genre" | "url" | "text" | "empty" {
  const value = input.trim();
  if (!value) return "empty";
  if (/^genre\s*:/i.test(value)) return "genre";
  if (/^https?:\/\//i.test(value)) return "url";
  return "text";
}

export function searchInputLengthBucket(input: string): "0" | "1-20" | "21-60" | "61-120" | "121+" {
  const length = input.trim().length;
  if (length === 0) return "0";
  if (length <= 20) return "1-20";
  if (length <= 60) return "21-60";
  if (length <= 120) return "61-120";
  return "121+";
}
