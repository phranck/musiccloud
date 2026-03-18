export type MediaKind = "image" | "document";

export interface MediaAsset {
  id: number;
  displayName: string;
  originalName: string;
  storedFilename: string;
  alias: string | null;
  mimeType: string;
  kind: MediaKind;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  url: string;
  createdAt: string;
  updatedAt: string;
  createdByUsername: string | null;
}
