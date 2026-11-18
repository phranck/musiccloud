/**
 * @file Tests for the Enable Banking client, driven through its exported
 * operations with the outbound transport replaced. The guarded fetch itself is
 * real, so the redirect refusal and the timeout are the ones production runs;
 * only the DNS answer and the bytes on the wire are stand-ins, and no request
 * leaves the machine.
 *
 * The cases on reading the payer out of an entry are ported from lmaa.space
 * (`apps/backend/src/__tests__/enable-banking-transactions.test.ts`).
 */
import { createVerify, generateKeyPairSync } from "node:crypto";
import type { LookupAddress } from "node:dns";
import { BankErrorCode } from "@musiccloud/shared";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** What the transport saw of each request: where it went and what it carried. */
interface SentRequest {
  target: URL;
  init: RequestInit;
}

/** The replaced transport and the requests it received. */
const wire = vi.hoisted(() => ({
  sent: [] as SentRequest[],
  answer: (async () => new Response("{}", { status: 200 })) as (request: SentRequest) => Promise<Response>,
}));

vi.mock("../lib/infra/fetch.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/infra/fetch.js")>();
  /** A public address, so the guarded fetch's address policy lets the request through. */
  const publicAddress: LookupAddress = { address: "8.8.8.8", family: 4 };
  return {
    ...real,
    fetchWithTimeout: real.createFetchWithTimeout({
      resolve: async () => [publicAddress],
      transport: (target, init) => {
        const request = { target, init };
        wire.sent.push(request);
        return wire.answer(request);
      },
    }),
  };
});

import { closeSession, createSession, fetchTransactions, startAuthorization } from "./enable-banking-client.js";

/** An application id of the shape Enable Banking issues. */
const APPLICATION_ID = "0b6c1f2e-3d4a-4b5c-8d6e-7f8091a2b3c4";

/** The one host the client may reach. */
const PROVIDER_HOST = "api.enablebanking.com";

/** The client's timeout: 15 seconds. */
const TIMEOUT_MS = 15_000;

/** The account the transaction cases read. */
const ACCOUNT_UID = "account-uid";

/** The days the transaction cases ask for. */
const RANGE = { from: "2026-09-01", to: "2026-09-07" };

/** A state of the shape and length the site issues. */
const STATE = "a".repeat(64);

/** The key pair the tests sign and verify with, generated once for the file. */
let publicKeyPem = "";
let privateKeyPem = "";

/**
 * Answers every request with this payload as JSON.
 *
 * @param payload - The body to answer with.
 * @param status - The status to answer with; 200 unless a case says otherwise.
 */
function answerWith(payload: unknown, status = 200) {
  wire.answer = async () => new Response(JSON.stringify(payload), { status });
}

/** One entry as the interface writes it, with everything the client reads. */
function entry(overrides: Record<string, unknown> = {}) {
  return {
    entry_reference: "entry-1",
    transaction_amount: { currency: "EUR", amount: "25.00" },
    credit_debit_indicator: "CRDT",
    booking_date: "2026-09-01",
    remittance_information: ["Donation: musiccloud.io"],
    debtor: { name: "Anna von Trapp" },
    ...overrides,
  };
}

/**
 * Reads the request token a sent request carried.
 *
 * @param request - The request as the transport saw it.
 * @returns The token's three parts.
 */
function tokenOf(request: SentRequest): { header: string; payload: string; signature: string } {
  const authorization = new Headers(request.init.headers).get("authorization") ?? "";
  const [header = "", payload = "", signature = ""] = authorization.replace(/^Bearer /, "").split(".");
  return { header, payload, signature };
}

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  privateKeyPem = pair.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
});

beforeEach(() => {
  wire.sent = [];
  answerWith({});
  vi.stubEnv("ENABLE_BANKING_APPLICATION_ID", APPLICATION_ID);
  vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", privateKeyPem);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("where the client sends a request", () => {
  it("reaches only api.enablebanking.com, over https, with redirects refused", async () => {
    answerWith({ session_id: "session-1", accounts: [{ uid: "account-1" }] });

    await createSession("code-1");

    expect(wire.sent).toHaveLength(1);
    const [request] = wire.sent;
    expect(request?.target.protocol).toBe("https:");
    expect(request?.target.host).toBe(PROVIDER_HOST);
    expect(request?.target.pathname).toBe("/sessions");
  });

  it("does not follow a redirect, so the token never reaches the address it names", async () => {
    wire.answer = async () =>
      new Response(null, { status: 302, headers: { location: "https://somewhere-else.example/sessions" } });

    await expect(createSession("code-1")).rejects.toMatchObject({ code: BankErrorCode.Unreachable });
    expect(wire.sent).toHaveLength(1);
    expect(wire.sent[0]?.target.host).toBe(PROVIDER_HOST);
  });

  it.each([
    ["a slash", "session/../../elsewhere"],
    ["a dot segment", ".."],
    ["a single dot", "."],
    ["nothing", ""],
    ["an encoded character", "session%2F1"],
  ])("refuses a session identifier with %s and sends nothing", async (_case, sessionId) => {
    await expect(closeSession(sessionId)).rejects.toMatchObject({ code: BankErrorCode.BadDestination });
    expect(wire.sent).toHaveLength(0);
  });

  it("refuses an account identifier that would leave its path, and sends nothing", async () => {
    await expect(fetchTransactions("../sessions", RANGE)).rejects.toMatchObject({
      code: BankErrorCode.BadDestination,
    });
    expect(wire.sent).toHaveLength(0);
  });

  it("closes a session at its own path", async () => {
    await closeSession("session-1");

    expect(wire.sent[0]?.init.method).toBe("DELETE");
    expect(wire.sent[0]?.target.pathname).toBe("/sessions/session-1");
  });
});

describe("how long the client waits", () => {
  /**
   * Makes every request hang until it is aborted, as a provider that never
   * answers would.
   */
  function hangUntilAborted() {
    wire.answer = ({ init }) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
  }

  it("is still waiting a moment before the 15 seconds are up", async () => {
    vi.useFakeTimers();
    hangUntilAborted();
    let settled = false;

    const pending = createSession("code-1").finally(() => {
      settled = true;
    });
    pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);

    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toBeDefined();
  });

  it("gives up after 15 seconds and reports the provider as unreachable", async () => {
    vi.useFakeTimers();
    hangUntilAborted();

    const pending = createSession("code-1");
    pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await expect(pending).rejects.toMatchObject({ code: BankErrorCode.Unreachable });
  });
});

describe("the request token", () => {
  it("is an RS256 token for Enable Banking, named by the application id and valid for five minutes", async () => {
    answerWith({ session_id: "session-1", accounts: [] });

    await createSession("code-1");

    const token = tokenOf(wire.sent[0] as SentRequest);
    expect(JSON.parse(Buffer.from(token.header, "base64url").toString())).toEqual({
      typ: "JWT",
      alg: "RS256",
      kid: APPLICATION_ID,
    });
    const claims = JSON.parse(Buffer.from(token.payload, "base64url").toString());
    expect(claims).toMatchObject({ iss: "enablebanking.com", aud: PROVIDER_HOST });
    expect(claims.exp - claims.iat).toBe(300);

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${token.header}.${token.payload}`);
    expect(verifier.verify(publicKeyPem, Buffer.from(token.signature, "base64url"))).toBe(true);
  });

  it("is not signed at all without a credential, and nothing is sent", async () => {
    vi.stubEnv("ENABLE_BANKING_APPLICATION_ID", "");
    vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", "");

    await expect(createSession("code-1")).rejects.toMatchObject({ code: BankErrorCode.NotConfigured });
    expect(wire.sent).toHaveLength(0);
  });
});

describe("what the provider answers", () => {
  it("reports a refusing status as refused", async () => {
    answerWith({ message: "nope" }, 422);

    await expect(createSession("code-1")).rejects.toMatchObject({ code: BankErrorCode.RequestRefused });
  });

  it("reports an answer that is not JSON as unexpected", async () => {
    wire.answer = async () => new Response("<html>gateway</html>", { status: 200 });

    await expect(createSession("code-1")).rejects.toMatchObject({ code: BankErrorCode.BadAnswer });
  });

  it("reports a session without an identifier as unexpected", async () => {
    answerWith({ accounts: [] });

    await expect(createSession("code-1")).rejects.toMatchObject({ code: BankErrorCode.BadAnswer });
  });

  it("starts an authorization for the configured return address and hands back the bank's address", async () => {
    answerWith({ url: "https://bank.example/authorize", authorization_id: "auth-1" });
    const validUntil = new Date("2027-03-02T00:00:00.000Z");

    const started = await startAuthorization(STATE, "https://dashboard.example/callback", validUntil);

    expect(started).toEqual({ url: "https://bank.example/authorize", authorizationId: "auth-1" });
    const body = JSON.parse(String(wire.sent[0]?.init.body));
    expect(body).toMatchObject({
      access: { valid_until: validUntil.toISOString() },
      state: STATE,
      redirect_url: "https://dashboard.example/callback",
      psu_type: "personal",
    });
  });

  it("refuses an authorization address that is not https, because the browser is sent to it", async () => {
    answerWith({ url: "http://bank.example/authorize", authorization_id: "auth-1" });

    await expect(startAuthorization(STATE, "https://dashboard.example/callback", new Date())).rejects.toMatchObject({
      code: BankErrorCode.BadAnswer,
    });
  });

  it("reduces a session to what is stored, with the consent end as a date", async () => {
    answerWith({
      session_id: "session-1",
      accounts: [{ uid: "account-1", iban: "AT00 0000" }],
      aspsp: { name: "Erste Bank", country: "AT" },
      access: { valid_until: "2027-03-02T00:00:00.000Z" },
    });

    expect(await createSession("code-1")).toEqual({
      sessionId: "session-1",
      accountUids: ["account-1"],
      aspspName: "Erste Bank",
      aspspCountry: "AT",
      consentValidUntil: new Date("2027-03-02T00:00:00.000Z"),
    });
  });

  it("reads a consent end it cannot parse as none", async () => {
    answerWith({ session_id: "session-1", accounts: [], access: { valid_until: "whenever" } });

    expect((await createSession("code-1")).consentValidUntil).toBeNull();
  });
});

describe("reading the payer out of an entry", () => {
  it("takes the name the statement gives the debtor", async () => {
    answerWith({ transactions: [entry()] });

    const page = await fetchTransactions(ACCOUNT_UID, RANGE);

    expect(page.transactions[0]?.payerName).toBe("Anna von Trapp");
  });

  it("reads an entry that names nobody as having no payer", async () => {
    answerWith({ transactions: [entry({ debtor: undefined })] });

    const page = await fetchTransactions(ACCOUNT_UID, RANGE);

    expect(page.transactions[0]?.payerName).toBe("");
  });

  it("reads a debtor without a name as having no payer", async () => {
    answerWith({ transactions: [entry({ debtor: {} })] });

    const page = await fetchTransactions(ACCOUNT_UID, RANGE);

    expect(page.transactions[0]?.payerName).toBe("");
  });

  it("takes the padding a bank puts around a name off it", async () => {
    answerWith({ transactions: [entry({ debtor: { name: "  Anna von Trapp  " } })] });

    const page = await fetchTransactions(ACCOUNT_UID, RANGE);

    expect(page.transactions[0]?.payerName).toBe("Anna von Trapp");
  });

  it("keeps reading an entry whose party the interface sent as null", async () => {
    answerWith({ transactions: [entry({ debtor: null })] });

    const page = await fetchTransactions(ACCOUNT_UID, RANGE);

    expect(page.transactions[0]).toMatchObject({ entryReference: "entry-1", payerName: "" });
  });

  it("carries no address off the party, whatever the interface sent", async () => {
    answerWith({
      transactions: [
        entry({
          debtor: { name: "Anna von Trapp", postal_address: { street_name: "Hauptstrasse" } },
        }),
      ],
    });

    const page = await fetchTransactions(ACCOUNT_UID, RANGE);

    expect(JSON.stringify(page.transactions[0])).not.toContain("Hauptstrasse");
  });
});

describe("reading the account's entries", () => {
  it("asks only for booked entries in the days given, at the account's own path", async () => {
    answerWith({ transactions: [] });

    await fetchTransactions(ACCOUNT_UID, RANGE, "next-page");

    const target = wire.sent[0]?.target as URL;
    expect(target.pathname).toBe(`/accounts/${ACCOUNT_UID}/transactions`);
    expect(Object.fromEntries(target.searchParams)).toEqual({
      date_from: RANGE.from,
      date_to: RANGE.to,
      transaction_status: "BOOK",
      strategy: "default",
      continuation_key: "next-page",
    });
  });

  it("turns an entry into cents, a direction and a day, and hands on the next page's key", async () => {
    answerWith({
      transactions: [
        entry({ transaction_amount: { currency: "EUR", amount: "-12.34" }, booking_date: "2026-09-01T10:00" }),
      ],
      continuation_key: "page-2",
    });

    expect(await fetchTransactions(ACCOUNT_UID, RANGE)).toEqual({
      transactions: [
        {
          entryReference: "entry-1",
          amountCents: 1234,
          currency: "EUR",
          isCredit: true,
          bookedOn: "2026-09-01",
          remittanceLines: ["Donation: musiccloud.io"],
          payerName: "Anna von Trapp",
        },
      ],
      continuationKey: "page-2",
    });
  });

  it("leaves out an entry it cannot date, name or price, rather than guessing", async () => {
    answerWith({
      transactions: [
        entry({ entry_reference: undefined }),
        entry({ booking_date: undefined, value_date: undefined }),
        entry({ transaction_amount: { currency: "EUR", amount: "lots" } }),
        entry({ entry_reference: "entry-kept", booking_date: undefined, value_date: "2026-09-02" }),
      ],
    });

    const page = await fetchTransactions(ACCOUNT_UID, RANGE);

    expect(page.transactions.map((transaction) => transaction.entryReference)).toEqual(["entry-kept"]);
    expect(page.continuationKey).toBeNull();
  });
});
