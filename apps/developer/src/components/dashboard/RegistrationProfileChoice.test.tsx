import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientRegistrationType, type ClientRegistrationTypeValue } from "@/lib/apiAccessClient";
import { RegistrationProfileChoice } from "./RegistrationProfileChoice";

function render(value: ClientRegistrationTypeValue = ClientRegistrationType.Development) {
  return renderToStaticMarkup(
    <RegistrationProfileChoice name="registrationType" value={value} onSelect={() => undefined} />,
  );
}

describe("RegistrationProfileChoice", () => {
  it("offers all three profiles as one named group", () => {
    const html = render();

    expect(html).toContain('value="development"');
    expect(html).toContain('value="confidential"');
    expect(html).toContain('value="public"');
    expect(html.match(/name="registrationType"/g)).toHaveLength(3);
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
  });

  it("explains each profile where it is chosen rather than behind a link", () => {
    const html = render();

    // What it is for.
    expect(html).toContain("on your own machine");
    expect(html).toContain("For a server you control");
    expect(html).toContain("installed on other people&#x27;s devices");
    // Where the credential lives.
    expect(html).toContain("in its environment or its secret store");
    expect(html).toContain("Each installation enrols itself and gets its own key");
  });

  it("says a distributed application must never carry a confidential secret", () => {
    const html = render();

    expect(html).toContain("Never ship this secret inside anything a user can download");
    expect(html).toContain("Never embed a confidential secret or a long-lived key in a distributed application");
  });

  it("names DPoP where the public profile is explained, rather than assuming it is known", () => {
    const html = render();

    expect(html).toContain("bound to a keypair the installation generates and keeps");
    expect(html).toContain("That binding is DPoP");
  });

  it("marks the profile that is currently chosen", () => {
    const html = render(ClientRegistrationType.Public);

    expect(html).toMatch(/<input[^>]*value="public"[^>]*checked|<input[^>]*checked[^>]*value="public"/);
  });
});
