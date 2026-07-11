import type { ApiErrorResponse, PublicContentPage, SharePageResponse } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import type { BackendFetchResult } from "@/api/client";
import { resolveShortRouteResults } from "./short-route-result";

const backendError: ApiErrorResponse = {
  error: "MC-DB-0001",
  errorId: "1bc8fa27-a606-44c4-b8a5-1f2067e41246",
  message: "The database permissions are invalid for this operation. (MC-DB-0001)",
};

const notFound: BackendFetchResult<never> = {
  error: {
    error: "MC-RES-0003",
    errorId: "55a38738-24e2-4fa9-81f1-2cf7037ca7c9",
    message: "The requested resource was not found. (MC-RES-0003)",
  },
  kind: "not-found",
  statusCode: 404,
};

describe("resolveShortRouteResults", () => {
  it("renders a share when content is absent", () => {
    const share = { kind: "success", data: { type: "track" } as SharePageResponse } as const;

    expect(resolveShortRouteResults(notFound, share)).toEqual({ kind: "share", data: share.data });
  });

  it("surfaces a share backend failure instead of converting it to 404", () => {
    const share: BackendFetchResult<SharePageResponse> = { kind: "error", statusCode: 500, error: backendError };

    expect(resolveShortRouteResults(notFound, share)).toEqual({
      kind: "error",
      statusCode: 500,
      error: backendError,
    });
  });

  it("returns not-found only when both namespaces explicitly return 404", () => {
    expect(resolveShortRouteResults(notFound, notFound)).toEqual({ kind: "not-found" });
  });

  it("prefers an existing content page even if the speculative share lookup fails", () => {
    const content = { kind: "success", data: { slug: "about" } as PublicContentPage } as const;
    const share: BackendFetchResult<SharePageResponse> = { kind: "error", statusCode: 500, error: backendError };

    expect(resolveShortRouteResults(content, share)).toEqual({ kind: "content", data: content.data });
  });
});
