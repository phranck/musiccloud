import { describe, expect, it } from "vitest";
import { apiReferenceOperationAnchor } from "./api-reference-anchor";

describe("apiReferenceOperationAnchor", () => {
  it("creates stable identifiers from generated HTTP methods and paths", () => {
    expect(apiReferenceOperationAnchor("GET", "/api/v1/resolve")).toBe("endpoint-get-api-v1-resolve");
    expect(apiReferenceOperationAnchor("POST", "/api/v1/cc/audio/{jamendoId}")).toBe(
      "endpoint-post-api-v1-cc-audio-jamendoid",
    );
    expect(apiReferenceOperationAnchor("DELETE", "/")).toBe("endpoint-delete-root");
  });
});
