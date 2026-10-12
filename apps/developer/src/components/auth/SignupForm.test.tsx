import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignupForm } from "./SignupForm";

describe("SignupForm", () => {
  it("starts the email field with the invited address, and leaves it editable", () => {
    const html = renderToStaticMarkup(<SignupForm invitedEmail="new@example.com" />);

    expect(html).toMatch(/<input[^>]*name="email"[^>]*value="new@example.com"/);
    expect(html).not.toMatch(/<input[^>]*name="email"[^>]*readonly/i);
  });

  it("starts empty without an invitation", () => {
    const html = renderToStaticMarkup(<SignupForm />);

    expect(html).toMatch(/<input[^>]*name="email"[^>]*value=""/);
  });
});
