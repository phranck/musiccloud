import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiTokenDto } from "@/lib/apiAccessClient";
import { RegistrationTokens } from "./RegistrationTokens";

function makeToken(overrides: Partial<ApiTokenDto> = {}): ApiTokenDto {
  return {
    id: "token-1",
    tokenPrefix: "examplepref",
    status: "active",
    createdAt: "2026-08-30T00:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function render(tokens: ApiTokenDto[], registrationActive = true) {
  return renderToStaticMarkup(
    <RegistrationTokens
      registrationId="client-1"
      registrationName="My Music App"
      publicClientId="mc_client_1"
      tokens={tokens}
      registrationActive={registrationActive}
    />,
  );
}

describe("RegistrationTokens", () => {
  it("shows only the masked prefix of an existing key, never a whole one", () => {
    const html = render([makeToken()]);

    expect(html).toContain("mc_live_examplepref_...");
    // Anything that looks like a full key would have a secret after the
    // prefix; the list carries the prefix and the ellipsis and nothing else.
    expect(html).not.toMatch(/mc_live_examplepref_[A-Za-z0-9]/);
  });

  it("says what a rotation does before it is done", () => {
    const html = render([makeToken()]);

    expect(html).toContain("Rotating issues a new key and stops the current one immediately");
    expect(html).toContain("put the new one in place first");
  });

  it("offers a key only where the registration can hold a working one", () => {
    expect(render([], true)).toContain("Create a key");
    expect(render([], false)).not.toContain("Create a key");
    expect(render([], false)).toContain("cannot hold a working key");
  });

  it("does not offer a second key whilst one is active", () => {
    expect(render([makeToken()])).not.toContain("Create a key");
    expect(render([makeToken({ status: "revoked" })])).toContain("Create a key");
  });
});
