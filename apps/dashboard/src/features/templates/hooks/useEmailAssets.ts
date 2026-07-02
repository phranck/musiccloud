import { ENDPOINTS } from "@musiccloud/shared";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToDataUrl } from "@/lib/files";

/** Response shape of `POST /api/admin/email-assets`: the newly created asset's id. */
export interface UploadedEmailAsset {
  id: string;
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
 * There is no `["email-assets"]` list query to invalidate on success: assets
 * are referenced by id (from a template's `image` block, or from the global
 * branding singleton's `headerAssetId`/`footerAssetId`) rather than browsed
 * as a collection, so this hook intentionally skips query invalidation.
 *
 * @returns A TanStack Query mutation accepting a `File` and resolving to the
 *   created {@link UploadedEmailAsset} (`{ id }`). The caller is responsible
 *   for storing the returned id wherever the asset reference belongs (a
 *   block's `assetId`, or the branding's `headerAssetId`/`footerAssetId`).
 */
export function useUploadEmailAsset() {
  return useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await fileToDataUrl(file);
      return api.post<UploadedEmailAsset>(ENDPOINTS.admin.emailAssets.upload, { dataUrl });
    },
  });
}
