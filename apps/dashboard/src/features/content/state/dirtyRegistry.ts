export type SliceKey =
  | "sidebar"
  | `meta:${string}`
  | `content:${string}`
  | `segments:${string}`
  | `translations:${string}`
  | `segment-translations:${string}`;

export type ResourceGroup = "pages" | "segments" | "translations" | "sidebar";

function groupOf(key: SliceKey): ResourceGroup {
  if (key === "sidebar") return "sidebar";
  if (key.startsWith("meta:") || key.startsWith("content:")) return "pages";
  if (key.startsWith("segments:")) return "segments";
  return "translations";
}

export interface DirtyRegistry {
  add(key: SliceKey): void;
  delete(key: SliceKey): void;
  has(key: SliceKey): boolean;
  size(): number;
  clear(): void;
  groupCount(): number;
  subscribe(fn: () => void): () => void;
}

export function createDirtyRegistry(): DirtyRegistry {
  const set = new Set<SliceKey>();
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((fn) => fn());
  return {
    add(k) {
      if (!set.has(k)) {
        set.add(k);
        notify();
      }
    },
    delete(k) {
      if (set.delete(k)) notify();
    },
    has(k) {
      return set.has(k);
    },
    size() {
      return set.size;
    },
    clear() {
      if (set.size > 0) {
        set.clear();
        notify();
      }
    },
    groupCount() {
      const g = new Set<ResourceGroup>();
      set.forEach((k) => g.add(groupOf(k)));
      return g.size;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
