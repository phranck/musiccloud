import { ENDPOINTS } from "@musiccloud/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PUBLIC_API_BASE_URL } from "@/lib/quickstart";
import { QuickstartPanel } from "./QuickstartPanel";

function render() {
  return renderToStaticMarkup(<QuickstartPanel registrationName="My Music App" publicClientId="mc_client_1" />);
}

describe("QuickstartPanel", () => {
  it("renders a runnable snippet whose path comes from the shared endpoint table", () => {
    const html = render();

    expect(html).toContain(`${PUBLIC_API_BASE_URL}${ENDPOINTS.v1.resolve}`.replace(/\//g, "/"));
    expect(html).toContain("X-API-Key");
  });

  it("offers the plain HTTP form first, so a developer is never left out", () => {
    const html = render();
    const curlAt = html.indexOf(">curl<");
    const javascriptAt = html.indexOf(">JavaScript<");

    expect(curlAt).toBeGreaterThan(-1);
    expect(javascriptAt).toBeGreaterThan(curlAt);
  });

  it("never puts a key into the snippet", () => {
    expect(render()).not.toContain("mc_live_");
  });

  it("says what the client id is where it shows it", () => {
    const html = render();

    expect(html).toContain("mc_client_1");
    expect(html).toContain("identifies this application and does not authenticate it");
  });

  it("mentions the keyless endpoint with its limit rather than hiding it", () => {
    const html = render();

    expect(html).toContain("needs no key at all");
    expect(html).toContain("10 requests a minute");
    expect(html).toContain("500 a day");
  });

  it("says language packages are not published rather than pretending they are", () => {
    expect(render()).toContain("Language packages are not published yet");
  });
});
