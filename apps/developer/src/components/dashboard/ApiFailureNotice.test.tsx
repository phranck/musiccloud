import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiFailureNotice } from "./ApiFailureNotice";

describe("ApiFailureNotice", () => {
  it("shows the message, the stable code and the error id", () => {
    const html = renderToStaticMarkup(
      <ApiFailureNotice
        code="MC-REQ-0003"
        message="You already hold 10 projects, which is the maximum."
        errorId="7f0f2c2e-0b1e-4a1a-9c1a-1a2b3c4d5e6f"
      />,
    );

    expect(html).toContain("You already hold 10 projects");
    expect(html).toContain("MC-REQ-0003");
    expect(html).toContain("7f0f2c2e-0b1e-4a1a-9c1a-1a2b3c4d5e6f");
    expect(html).toContain('aria-label="Copy the error id"');
  });

  it("is announced as an alert, so it is not missed after a submit", () => {
    const html = renderToStaticMarkup(<ApiFailureNotice message="Something went wrong." />);

    expect(html).toContain('role="alert"');
  });

  it("says how long to wait when the backend asked for a wait", () => {
    const html = renderToStaticMarkup(
      <ApiFailureNotice code="MC-API-0003" message="Too many requests." retryAfterSeconds={34} />,
    );

    expect(html).toContain("Try again in 34 seconds.");
  });

  it("still says something when the backend sent nothing usable", () => {
    const html = renderToStaticMarkup(<ApiFailureNotice />);

    expect(html).toContain("Something went wrong. Please try again.");
  });
});
