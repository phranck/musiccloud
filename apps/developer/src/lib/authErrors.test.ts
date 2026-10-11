import { describe, expect, it } from "vitest";
import { AuthErrorCode, authErrorLabel, isEmailFieldError } from "./authErrors";

describe("isEmailFieldError", () => {
  it("attributes both address refusals to the email field", () => {
    expect(isEmailFieldError(AuthErrorCode.EmailTaken)).toBe(true);
    expect(isEmailFieldError(AuthErrorCode.InvalidEmail)).toBe(true);
  });

  it("leaves everything else for the field the form already blames", () => {
    // The generic 400 a short password arrives as, which must not be explained
    // under the email field.
    expect(isEmailFieldError("MC-REQ-0001")).toBe(false);
    expect(isEmailFieldError(AuthErrorCode.InvalidCredentials)).toBe(false);
    expect(isEmailFieldError(undefined)).toBe(false);
  });
});

describe("authErrorLabel", () => {
  it("says what to do about an address the backend cannot use", () => {
    expect(authErrorLabel(AuthErrorCode.InvalidEmail, "This is not a valid email address. (MC-REQ-0006)")).toBe(
      "Enter a valid email address.",
    );
  });
});
