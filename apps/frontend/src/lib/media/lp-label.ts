interface CatalogLabelInput {
  isrc?: string;
  label?: string;
  licenseLabel?: string;
  upc?: string;
}

export function releaseYearFromDate(releaseDate?: string): string | undefined {
  return releaseDate?.slice(0, 4) || undefined;
}

export function catalogTextFromIds({ isrc, label, licenseLabel, upc }: CatalogLabelInput): string | undefined {
  if (isrc) return `ISRC ${isrc}`;
  if (upc) return `UPC ${upc}`;
  return label || licenseLabel || undefined;
}

export function labelAlbumTitleFrom(title?: string, fallback?: string): string | undefined {
  return title || fallback || undefined;
}
