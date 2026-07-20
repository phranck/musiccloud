import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MusiccloudApiError,
  MusiccloudErrorCode,
  MusiccloudProtocolError,
  MusiccloudTransportError,
  classifyMusiccloudTransportError,
  musiccloudErrorFromResponse,
  parseMusiccloudErrorResponse,
} from "./musiccloud-errors.ts";

interface ApiFixture {
  name: string;
  status: number;
  headers: Record<string, string>;
  body: {
    error: string;
    message: string;
    errorId: string;
    context?: Record<string, string | number>;
  };
}

interface ProtocolFixture {
  name: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  reason: string;
}

const fixture = JSON.parse(
  await readFile(new URL("../fixtures/http-errors.json", import.meta.url), "utf8"),
) as { apiErrors: ApiFixture[]; protocolErrors: ProtocolFixture[] };

test("parses canonical and future API envelopes without losing fields", () => {
  for (const item of fixture.apiErrors) {
    const error = parseMusiccloudErrorResponse({
      status: item.status,
      headers: item.headers,
      body: JSON.stringify(item.body),
    });

    assert.ok(error instanceof MusiccloudApiError, item.name);
    assert.equal(error.code, item.body.error, item.name);
    assert.equal(error.message, item.body.message, item.name);
    assert.equal(error.errorId, item.body.errorId, item.name);
    assert.equal(error.status, item.status, item.name);
    assert.deepEqual(error.context, item.body.context, item.name);
    assert.match(error.toString(), new RegExp(item.body.error));
    assert.match(error.toString(), new RegExp(item.body.errorId));
  }
});

test("exposes auth and rate-limit helpers without retaining sensitive headers", () => {
  const auth = parseMusiccloudErrorResponse({
    status: 401,
    headers: {},
    body: JSON.stringify(fixture.apiErrors.find((item) => item.status === 401)?.body),
  });
  const rateLimitItem = fixture.apiErrors.find((item) => item.status === 429);
  assert.ok(rateLimitItem);
  const rateLimitBody = {
    ...rateLimitItem.body,
    context: {
      ...rateLimitItem.body.context,
      privateKey: "fixture-private-key",
      refreshToken: "fixture-refresh-token",
    },
  };
  const rateLimit = parseMusiccloudErrorResponse({
    status: rateLimitItem.status,
    headers: rateLimitItem.headers,
    body: JSON.stringify(rateLimitBody),
  });

  assert.ok(auth instanceof MusiccloudApiError);
  assert.equal(auth.isAuthenticationError, true);
  assert.equal(auth.code, MusiccloudErrorCode.authenticationRequired);
  assert.ok(rateLimit instanceof MusiccloudApiError);
  assert.equal(rateLimit.isRateLimitError, true);
  assert.equal(rateLimit.isRetryable, true);
  assert.equal(rateLimit.retryAfterSeconds, 42);
  assert.equal(rateLimit.context?.privateKey, undefined);
  assert.equal(rateLimit.context?.refreshToken, undefined);
  assert.deepEqual(rateLimit.retryHeaders, {
    "retry-after": "42",
    "x-ratelimit-limit": "10",
    "x-ratelimit-remaining": "0",
  });
  assert.doesNotMatch(
    `${rateLimit.toString()} ${JSON.stringify(rateLimit.retryHeaders)} ${JSON.stringify(rateLimit.context)}`,
    /fixture-secret|fixture-proof|fixture-key|fixture-private-key|fixture-refresh-token/,
  );
  assert.doesNotMatch(JSON.stringify(rateLimit.retryHeaders), /authorization|dpop|api-key|private-key|token/i);
});

test("keeps malformed and non-JSON responses as protocol errors", () => {
  for (const item of fixture.protocolErrors) {
    const error = parseMusiccloudErrorResponse(item);
    const contentTypeKey = Object.keys(item.headers).find((key) => key.toLowerCase() === "content-type");

    assert.ok(error instanceof MusiccloudProtocolError, item.name);
    assert.equal(error.status, item.status, item.name);
    assert.equal(error.reason, item.reason, item.name);
    assert.equal(error.bodyLength, item.body.length, item.name);
    assert.equal(error.contentType, contentTypeKey === undefined ? undefined : item.headers[contentTypeKey], item.name);
    assert.equal("code" in error, false, item.name);
    assert.doesNotMatch(error.toString(), /fixture-secret|Authorization/i);
  }
});

test("classifies cancellation, timeout, DNS, TLS, and network failures", () => {
  for (const [marker, kind] of [
    [{ name: "AbortError" }, "cancelled"],
    [{ code: "ETIMEDOUT" }, "timeout"],
    [{ code: "ENOTFOUND" }, "dns"],
    [{ code: "CERT_HAS_EXPIRED" }, "tls"],
    [{ code: "ERR_SSL_WRONG_VERSION_NUMBER" }, "tls"],
    [{ code: "ECONNRESET" }, "network"],
  ] as const) {
    const error = classifyMusiccloudTransportError(marker);
    assert.ok(error instanceof MusiccloudTransportError);
    assert.equal(error.kind, kind);
    assert.equal("code" in error, false);
  }

  assert.equal(classifyMusiccloudTransportError({ cause: { code: "ENOTFOUND" } }).kind, "dns");
  assert.equal(classifyMusiccloudTransportError({ cause: { code: "CERT_HAS_EXPIRED" } }).kind, "tls");
});

test("classifies response body read failures as transport errors", async () => {
  const response = {
    status: 502,
    headers: {},
    text: async () => {
      throw { cause: { code: "EAI_AGAIN" } };
    },
  } as unknown as Response;

  const error = await musiccloudErrorFromResponse(response);
  assert.ok(error instanceof MusiccloudTransportError);
  assert.equal(error.kind, "dns");
});
