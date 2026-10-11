/**
 * Parses `input` as an http(s) URL, adding `https://` when the scheme is
 * missing, because a link copied from an address bar often comes without one.
 *
 * The Jamendo link parser and the music-link hosts both read a pasted link
 * through this, so they agree on what counts as a link at all.
 *
 * @param input - A raw query string, as typed or pasted.
 * @returns The parsed URL, or `null` for empty input, input containing
 *   whitespace, or anything that does not parse as an http(s) URL.
 */
export function parseLinkCandidate(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
