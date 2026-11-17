import {
  formatCreditorReference,
  issueSponsorshipReference,
  PENDING_SPONSORSHIP_BODY_MAX_BYTES,
} from "@musiccloud/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const createSponsorshipRequestMock = vi.fn();
const updateSponsorshipRequestMock = vi.fn();

vi.mock("@/api/client", () => ({
  createSponsorshipRequest: createSponsorshipRequestMock,
  updateSponsorshipRequest: updateSponsorshipRequestMock,
}));

const { POST } = await import("./sponsorships");
const { PUT } = await import("./sponsorships/[reference]");

/** The visitor's address as Astro hands it to the route. */
const CLIENT_ADDRESS = "203.0.113.10";

/** A request body as the form sends it. */
const BODY = JSON.stringify({
  name: "Ada",
  link: "https://chaos.social/@ada",
  claim: "Music.",
  amountCents: 5_000,
  published: true,
});

/** A reference issued the way the backend issues one. */
const REFERENCE = issueSponsorshipReference((size) => crypto.getRandomValues(new Uint8Array(size)));

/** What the backend answers once it has stored a request. */
const RECEIPT = { reference: REFERENCE, referenceFormatted: formatCreditorReference(REFERENCE) };

/**
 * A backend answer.
 *
 * @param status - Its status.
 * @param body - Its JSON body.
 * @param headers - Any further headers.
 * @returns The response.
 */
function backendAnswer(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/**
 * The request a browser sends to one of the proxies.
 *
 * @param method - `POST` or `PUT`.
 * @param body - The body.
 * @returns The request.
 */
function browserRequest(method: string, body: string): Request {
  return new Request("https://musiccloud.test/api/sponsorships", { method, body });
}

/** Calls the POST route the way Astro does. */
function post(body: string) {
  return POST({ request: browserRequest("POST", body), clientAddress: CLIENT_ADDRESS } as Parameters<typeof POST>[0]);
}

/** Calls the PUT route the way Astro does. */
function put(reference: string, body: string) {
  return PUT({
    params: { reference },
    request: browserRequest("PUT", body),
    clientAddress: CLIENT_ADDRESS,
  } as unknown as Parameters<typeof PUT>[0]);
}

afterEach(() => {
  createSponsorshipRequestMock.mockReset();
  updateSponsorshipRequestMock.mockReset();
});

describe("POST /api/sponsorships", () => {
  it("forwards the body and the visitor's address, and passes the receipt back uncached", async () => {
    createSponsorshipRequestMock.mockResolvedValue(backendAnswer(201, RECEIPT));

    const response = await post(BODY);

    expect(createSponsorshipRequestMock).toHaveBeenCalledWith(BODY, CLIENT_ADDRESS);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(RECEIPT);
  });

  it("passes a refusal through with its code, message, error ID and Retry-After", async () => {
    const refusal = { error: "MC-API-0003", message: "Too many requests. (MC-API-0003)", errorId: "err-1" };
    createSponsorshipRequestMock.mockResolvedValue(backendAnswer(429, refusal, { "Retry-After": "3600" }));

    const response = await post(BODY);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(refusal);
  });

  it("refuses a body above the limit without asking the backend", async () => {
    const response = await post("x".repeat(PENDING_SPONSORSHIP_BODY_MAX_BYTES + 1));

    expect(createSponsorshipRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "MC-REQ-0001", errorId: expect.any(String) });
  });

  it("forwards a body of exactly the limit", async () => {
    createSponsorshipRequestMock.mockResolvedValue(backendAnswer(400, { error: "MC-REQ-0001" }));
    const body = "x".repeat(PENDING_SPONSORSHIP_BODY_MAX_BYTES);

    await post(body);

    expect(createSponsorshipRequestMock).toHaveBeenCalledWith(body, CLIENT_ADDRESS);
  });
});

describe("PUT /api/sponsorships/:reference", () => {
  it("forwards the reference as it is stored, the body and the visitor's address", async () => {
    updateSponsorshipRequestMock.mockResolvedValue(backendAnswer(200, RECEIPT));

    const response = await put(formatCreditorReference(REFERENCE).toLowerCase(), BODY);

    expect(updateSponsorshipRequestMock).toHaveBeenCalledWith(REFERENCE, BODY, CLIENT_ADDRESS);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(RECEIPT);
  });

  it("passes a refusal through with its code, message and error ID", async () => {
    const refusal = { error: "MC-REQ-0013", message: "This address cannot be linked. (MC-REQ-0013)", errorId: "err-2" };
    updateSponsorshipRequestMock.mockResolvedValue(backendAnswer(400, refusal));

    const response = await put(REFERENCE, BODY);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(refusal);
  });

  it("answers a reference that cannot be ours without asking the backend", async () => {
    const response = await put("RF00SPON0000000000000", BODY);

    expect(updateSponsorshipRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "MC-RES-0003", errorId: expect.any(String) });
  });

  it("refuses a body above the limit without asking the backend", async () => {
    const response = await put(REFERENCE, "x".repeat(PENDING_SPONSORSHIP_BODY_MAX_BYTES + 1));

    expect(updateSponsorshipRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(413);
  });
});
