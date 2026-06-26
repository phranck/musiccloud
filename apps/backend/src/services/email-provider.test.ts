import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email-provider.js";

const fetchMock = vi.fn();

/** Build a fake SMTP2GO HTTP 200 response carrying the given `data` block. */
function smtp2goResponse(data: object) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ request_id: "req-1", data }),
    text: async () => "",
  };
}

describe("sendEmail (SMTP2GO provider)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SMTP2GO_API_KEY", "api-test-key");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "noreply@musiccloud.io");
    vi.stubEnv("EMAIL_FROM_NAME", "musiccloud");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts to the EU endpoint with the api-key header and the SMTP2GO body shape", async () => {
    fetchMock.mockResolvedValue(smtp2goResponse({ succeeded: 1, failed: 0, failures: [] }));

    await sendEmail({ to: { email: "dev@example.com", name: "Dev" }, subject: "Hi", html: "<p>Hi</p>" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://eu-api.smtp2go.com/v3/email/send");
    expect((options.headers as Record<string, string>)["X-Smtp2go-Api-Key"]).toBe("api-test-key");

    const body = JSON.parse(options.body as string);
    expect(body.sender).toBe("musiccloud <noreply@musiccloud.io>");
    expect(body.to).toEqual(["Dev <dev@example.com>"]);
    expect(body.subject).toBe("Hi");
    expect(body.html_body).toBe("<p>Hi</p>");
    expect(body.text_body).toBeUndefined();
  });

  it("sends a bare address when no recipient name is given and includes text_body when provided", async () => {
    fetchMock.mockResolvedValue(smtp2goResponse({ succeeded: 1, failed: 0, failures: [] }));

    await sendEmail({ to: { email: "a@b.co" }, subject: "s", html: "<b>h</b>", text: "h" });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.to).toEqual(["a@b.co"]);
    expect(body.text_body).toBe("h");
  });

  it("throws on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "denied", json: async () => ({}) });

    await expect(sendEmail({ to: { email: "a@b.co" }, subject: "s", html: "h" })).rejects.toThrow(
      /SMTP2GO API error \(400\)/,
    );
  });

  it("throws when a 200 response reports a failed recipient", async () => {
    fetchMock.mockResolvedValue(smtp2goResponse({ succeeded: 0, failed: 1, failures: ["a@b.co"] }));

    await expect(sendEmail({ to: { email: "a@b.co" }, subject: "s", html: "h" })).rejects.toThrow(/not accepted/);
  });
});
