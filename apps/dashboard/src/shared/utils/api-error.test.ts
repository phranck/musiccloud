import { describe, expect, it } from "vitest";

import { createApiRequestError } from "@/shared/utils/api-error";

describe("createApiRequestError", () => {
  it("preserves the stable backend code, message, details, and errorId", async () => {
    const error = await createApiRequestError({
      status: 400,
      json: async () => ({
        error: "MC-REQ-0001",
        errorId: "reserved-docs-error-id",
        message: "Developer Portal path '/docs/authentication' is reserved (MC-REQ-0001)",
        details: [{ section: "pages", index: 0, message: "reserved" }],
      }),
    });

    expect(error).toMatchObject({
      errorCode: "MC-REQ-0001",
      errorId: "reserved-docs-error-id",
      responseMessage: "Developer Portal path '/docs/authentication' is reserved (MC-REQ-0001)",
      details: [{ section: "pages", index: 0, message: "reserved" }],
    });
  });

  it("leaves a missing field empty and takes the caller's fallback message", async () => {
    const error = await createApiRequestError(
      {
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      },
      "The page could not be saved.",
    );

    expect(error).toMatchObject({
      message: "The page could not be saved.",
      status: 502,
      responseMessage: null,
      errorCode: null,
      errorId: null,
      details: null,
    });
  });
});
