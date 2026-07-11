/**
 * Stable cache identity for an album when an upstream track provides no
 * album URL or UPC. The identity deliberately contains the primary artist:
 * title-only keys would make unrelated albums share a Discogs layout.
 */
export function createAlbumIdentityKey(input: { artists: string[]; title: string }): string | undefined {
  const mainArtist = normalizeIdentityPart(input.artists[0]);
  const title = normalizeIdentityPart(input.title);
  if (!mainArtist || !title) return undefined;
  return `${mainArtist}::${title}`;
}

function normalizeIdentityPart(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
