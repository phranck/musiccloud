import type { ArtistProfile } from "@musiccloud/shared";

export function hasAmbiguousLastFmBio(summary: string | null | undefined): boolean {
  return /^There (?:are|is) at least \d+ artists? with this name\b/i.test(summary?.trim() ?? "");
}

export function sanitizeArtistProfile(profile: ArtistProfile | null): ArtistProfile | null {
  if (!profile || !hasAmbiguousLastFmBio(profile.bioSummary)) return profile;
  return {
    ...profile,
    bioSummary: null,
    scrobbles: null,
    similarArtists: [],
  };
}
