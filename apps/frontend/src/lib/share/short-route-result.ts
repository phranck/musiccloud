import type { ApiErrorResponse, PublicContentPage, SharePageResponse } from "@musiccloud/shared";
import type { BackendFetchResult } from "@/api/client";

export type ShortRouteResult =
  | { kind: "content"; data: PublicContentPage }
  | { kind: "share"; data: SharePageResponse }
  | { kind: "not-found" }
  | { kind: "error"; error: ApiErrorResponse; statusCode: number };

export function resolveShortRouteResults(
  content: BackendFetchResult<PublicContentPage>,
  share: BackendFetchResult<SharePageResponse>,
): ShortRouteResult {
  if (content.kind === "success") return { kind: "content", data: content.data };
  if (share.kind === "success") return { kind: "share", data: share.data };
  if (share.kind === "error") return share;
  if (content.kind === "error") return content;
  return { kind: "not-found" };
}
