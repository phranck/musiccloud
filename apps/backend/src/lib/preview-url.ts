export function getDeezerPreviewExpiry(previewUrl: string): number | null {
  try {
    const url = new URL(previewUrl);
    if (!/(^|\.)dzcdn\.net$/i.test(url.hostname)) return null;

    const token = url.searchParams.get("hdnea");
    if (!token) return null;

    const expPart = token.split("~").find((part) => part.startsWith("exp="));
    if (!expPart) return null;

    const expiresAtSeconds = Number(expPart.slice(4));
    if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) return null;

    return expiresAtSeconds * 1000;
  } catch {
    return null;
  }
}

export function isExpiredDeezerPreviewUrl(previewUrl: string, now = Date.now()): boolean {
  const expiresAt = getDeezerPreviewExpiry(previewUrl);
  return expiresAt !== null && expiresAt <= now;
}
