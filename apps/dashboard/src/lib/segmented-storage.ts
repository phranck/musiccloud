export function getSegmentedStorageKey(userId: string | null | undefined, key: string): string {
  const prefix = userId ? `u:${userId}` : "anon";
  return `seg:${prefix}:${key}`;
}
