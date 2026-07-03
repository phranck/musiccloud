import { ENDPOINTS } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToDataUrl } from "@/lib/files";

/** Response shape of `POST /api/admin/email-assets`: the newly created asset's id. */
export interface UploadedEmailAsset {
  id: string;
}

/**
 * Metadata of one stored email image asset, as returned by
 * `GET /api/admin/email-assets` (MC-079). Bytes are not included — the image
 * itself is fetched by id from the public serve route
 * (`/api/admin/email-assets/:id`). Backs the shared-asset picker.
 */
export interface EmailAsset {
  id: string;
  mimeType: string;
  /** ISO timestamp string (the API serialises the DB `created_at` to JSON). */
  createdAt: string;
}

/** TanStack Query key for the shared email-asset list. */
const EMAIL_ASSETS_QUERY_KEY = ["email-assets"] as const;

/**
 * Lists every stored email image asset (newest first) for the shared-asset
 * picker, so a previously uploaded image can be reused without re-uploading.
 *
 * @returns A TanStack Query result wrapping the {@link EmailAsset} list.
 */
export function useEmailAssets() {
  return useQuery({
    queryKey: EMAIL_ASSETS_QUERY_KEY,
    queryFn: () => api.get<EmailAsset[]>(ENDPOINTS.admin.emailAssets.list),
  });
}

/**
 * Uploads an image `File` as a new `email_assets` row and returns its id.
 *
 * The file is read client-side into a `data:` URL (via {@link fileToDataUrl})
 * and POSTed as JSON (`{ dataUrl }`), matching the backend's
 * `admin-email-assets.ts` route contract (mirrors the admin-user avatar
 * upload's same `data:` URL shape). The backend whitelists JPEG/PNG/WebP and
 * caps the decoded size at 5 MB; a rejected upload surfaces as the
 * mutation's `error` (`api.post` rejects on any non-2xx response).
 *
 * On success it invalidates the {@link useEmailAssets} list query so the
 * shared-asset picker immediately shows the newly uploaded image.
 *
 * @returns A TanStack Query mutation accepting a `File` and resolving to the
 *   created {@link UploadedEmailAsset} (`{ id }`). The caller is responsible
 *   for storing the returned id wherever the asset reference belongs (a
 *   block's `assetId`, or a branding asset field).
 */
export function useUploadEmailAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await fileToDataUrl(file);
      return api.post<UploadedEmailAsset>(ENDPOINTS.admin.emailAssets.list, { dataUrl });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EMAIL_ASSETS_QUERY_KEY });
    },
  });
}
