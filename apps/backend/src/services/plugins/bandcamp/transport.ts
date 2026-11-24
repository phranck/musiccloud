/**
 * @file Fetches Bandcamp pages and Bandcamp's search endpoint through `curl`.
 *
 * Bandcamp's CDN answers every request from Node's HTTP stack, whatever its
 * headers, with a JavaScript "Client Challenge" page instead of the content,
 * while `curl` gets the content. The Bandcamp adapter therefore sends its
 * requests through `curl` rather than `fetchWithTimeout`.
 *
 * `fetchWithTimeout` guards against requests to private addresses. This module
 * replaces that guard with a host list: it only ever contacts
 * `https://bandcamp.com` and its subdomains, and checks every redirect target
 * against the same list before following it. `curl` runs through `execFile`
 * with an argument list, so no shell sees the URL.
 */
import { execFile } from "node:child_process";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { ENGLISH_ACCEPT_LANGUAGE, PAGE_ACCEPT } from "../_shared/browser-fetch.js";
import { SCRAPER_USER_AGENT } from "../_shared/user-agent.js";

/** The executable this module runs. It is part of the `alpine/nodejs` base image the backend runs on. */
const CURL_EXECUTABLE = "curl";

/**
 * The hosts a request may go to: `bandcamp.com` itself, which serves the
 * search endpoint, and every `{artist}.bandcamp.com` subdomain.
 */
const BANDCAMP_HOST_PATTERN = /^(?:[a-z0-9-]+\.)?bandcamp\.com$/;

/** The only scheme a request or a redirect may use, as `URL.protocol` spells it. */
const BANDCAMP_PROTOCOL = "https:";

/** The same restriction in `curl`'s `--proto` syntax, so `curl` refuses any other scheme as well. */
const CURL_PROTOCOLS = "=https";

/** How many redirects one request follows before it gives up. Bandcamp redirects at most once in practice. */
const MAX_REDIRECTS = 3;

/** The largest body accepted, 5 MiB. An album page is about 300 KB, so this only stops a runaway answer. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Room above {@link MAX_BODY_BYTES} for the child process's output buffer, so
 * a body that `curl` stops at the limit never overflows the buffer first.
 */
const OUTPUT_BUFFER_MARGIN_BYTES = 64 * 1024;

/** Extra time the child process gets beyond `curl`'s own `--max-time` before it is killed. */
const PROCESS_KILL_GRACE_MS = 1000;

/** Milliseconds per second, to turn the caller's timeout into `curl`'s `--max-time`. */
const MS_PER_SECOND = 1000;

/** The lowest HTTP status `Response` accepts. A status below it means `curl` reported no answer. */
const MIN_RESPONSE_STATUS = 200;

/** The highest valid HTTP status. */
const MAX_RESPONSE_STATUS = 599;

/** The statuses that carry a redirect `curl` was told not to follow by itself. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * What `curl` writes to stderr after a transfer, one value per line: the
 * status, the address a redirect points to (empty for no redirect), and the
 * content type. `%{stderr}` switches the output so the body on stdout stays
 * untouched. `--silent` keeps progress output off stderr, so on success it
 * holds only these lines.
 */
const WRITE_OUT_FORMAT = "%{stderr}%{http_code}\n%{redirect_url}\n%{content_type}";

/** The `Accept` header a browser sends for a page. */
const ACCEPT_HEADER = `Accept: ${PAGE_ACCEPT}`;

/** The `Accept-Language` header, so Bandcamp answers in English. */
const ACCEPT_LANGUAGE_HEADER = `Accept-Language: ${ENGLISH_ACCEPT_LANGUAGE}`;

/** The `Content-Type` header of a request that POSTs JSON, such as Bandcamp's app endpoints. */
const JSON_CONTENT_TYPE_HEADER = "Content-Type: application/json";

/** The title of the challenge page Bandcamp's CDN sends instead of content. */
const CLIENT_CHALLENGE_TITLE_PATTERN = /<title>\s*Client Challenge\s*<\/title>/i;

/** The path prefix the challenge page loads its assets from. */
const CLIENT_CHALLENGE_ASSET_MARKER = "/_fs-ch-";

/** The upstream name {@link UpstreamUnavailableError} carries for this module's failures. */
const UPSTREAM_SOURCE = "bandcamp";

/** The component name in this module's log records. */
const LOG_COMPONENT = "Bandcamp";

/** The operation name in this module's log records. */
const LOG_OPERATION = "bandcamp_request";

/**
 * The code this module's failures are logged under: Bandcamp's prefix with
 * the hint for a failure the scheme does not name, as `serviceHttpError`
 * builds it for a 503.
 */
const LOG_ERROR_CODE = "MC-API-8201";

/** What `curl` printed, as {@link curlRunner} returns it. */
export interface CurlOutput {
  /** The response body. */
  stdout: string;
  /** The lines {@link WRITE_OUT_FORMAT} describes. */
  stderr: string;
}

/**
 * Runs `curl`. It is an object so tests can replace `run`, which a module
 * namespace does not allow.
 */
export const curlRunner = {
  /**
   * Runs `curl` with the given arguments, without a shell.
   *
   * @param args - The arguments, each passed to `curl` as one argument.
   * @param timeoutMs - How long the process may run before it is killed.
   * @returns What `curl` wrote to stdout and stderr.
   * @throws The `execFile` error when `curl` exits with a status other than
   *   0, is killed, or writes more than the output buffer holds.
   */
  run(args: readonly string[], timeoutMs: number): Promise<CurlOutput> {
    return new Promise((resolve, reject) => {
      execFile(
        CURL_EXECUTABLE,
        args,
        { encoding: "utf8", maxBuffer: MAX_BODY_BYTES + OUTPUT_BUFFER_MARGIN_BYTES, timeout: timeoutMs },
        (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        },
      );
    });
  },
};

/**
 * Says whether a URL is one this module may request: https, a Bandcamp host,
 * the default port, and no credentials.
 *
 * @param url - Any URL.
 * @returns `true` when the URL may be requested.
 */
export function isBandcampUrl(url: URL): boolean {
  return (
    url.protocol === BANDCAMP_PROTOCOL &&
    BANDCAMP_HOST_PATTERN.test(url.hostname) &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
}

/**
 * Says whether a body is the CDN's client challenge rather than Bandcamp's content.
 *
 * @param body - A response body.
 * @returns `true` for the challenge page.
 */
export function isClientChallenge(body: string): boolean {
  return CLIENT_CHALLENGE_TITLE_PATTERN.test(body) || body.includes(CLIENT_CHALLENGE_ASSET_MARKER);
}

/**
 * Builds the `curl` arguments for one request that follows no redirect itself.
 *
 * `-q` comes first so no `.curlrc` changes the request, `--noproxy` keeps an
 * environment proxy out of it, and `--` ends the options so the URL is never
 * read as one.
 *
 * @param url - The validated URL.
 * @param timeoutMs - The request's time budget.
 * @param jsonBody - A JSON document to POST, or `undefined` for a GET.
 * @returns The argument list.
 */
function curlArguments(url: URL, timeoutMs: number, jsonBody: string | undefined): string[] {
  const post = jsonBody === undefined ? [] : ["--header", JSON_CONTENT_TYPE_HEADER, "--data-binary", jsonBody];
  return [
    "-q",
    "--silent",
    "--show-error",
    "--compressed",
    "--noproxy",
    "*",
    "--proto",
    CURL_PROTOCOLS,
    "--max-redirs",
    "0",
    "--max-time",
    String(timeoutMs / MS_PER_SECOND),
    "--max-filesize",
    String(MAX_BODY_BYTES),
    "--user-agent",
    SCRAPER_USER_AGENT,
    "--header",
    ACCEPT_HEADER,
    "--header",
    ACCEPT_LANGUAGE_HEADER,
    ...post,
    "--write-out",
    WRITE_OUT_FORMAT,
    "--",
    url.href,
  ];
}

/** One hop's answer, read from {@link WRITE_OUT_FORMAT}. */
interface HopAnswer {
  status: number;
  redirectUrl: string;
  contentType: string;
  body: string;
}

/**
 * Reads the status, redirect target and content type `curl` wrote to stderr.
 *
 * @param output - What `curl` printed.
 * @returns The hop's answer.
 * @throws {UpstreamUnavailableError} When the status is missing or outside the
 *   range of an HTTP answer.
 */
function readHopAnswer(output: CurlOutput): HopAnswer {
  const [statusLine = "", redirectUrl = "", contentType = ""] = output.stderr.split("\n");
  const status = Number.parseInt(statusLine, 10);
  if (!Number.isInteger(status) || status < MIN_RESPONSE_STATUS || status > MAX_RESPONSE_STATUS) {
    throw new UpstreamUnavailableError(UPSTREAM_SOURCE, `Bandcamp request returned no HTTP status (${statusLine})`);
  }
  return { status, redirectUrl: redirectUrl.trim(), contentType: contentType.trim(), body: output.stdout };
}

/**
 * Logs a request that Bandcamp did not answer with content and builds the
 * error for it.
 *
 * @param url - The URL of the hop that failed.
 * @param outcome - What happened, such as `client_challenge`.
 * @param message - The error's message.
 * @param detail - Extra fields for the log record.
 * @param cause - The underlying error, when there is one.
 * @returns The error to throw.
 */
function unavailable(
  url: URL,
  outcome: string,
  message: string,
  detail: Record<string, unknown> = {},
  cause?: unknown,
): UpstreamUnavailableError {
  log.deviation(
    {
      component: LOG_COMPONENT,
      errorCode: LOG_ERROR_CODE,
      operation: LOG_OPERATION,
      outcome,
      host: url.hostname,
      path: url.pathname,
      ...detail,
    },
    cause,
  );
  return new UpstreamUnavailableError(UPSTREAM_SOURCE, message, cause);
}

/**
 * Requests a Bandcamp URL through `curl` and returns the answer as a `Response`.
 *
 * Redirects are followed here, up to {@link MAX_REDIRECTS}, and only to
 * Bandcamp hosts. An error status is returned as a `Response` like `fetch`
 * does, so the caller decides what a 404 means.
 *
 * @param url - The address, which must pass {@link isBandcampUrl}.
 * @param timeoutMs - The time budget of each hop.
 * @param jsonBody - A JSON document to POST, as Bandcamp's app endpoints
 *   take it, or `undefined` (the default) for a GET.
 * @returns The final answer, with its status, content type and body.
 * @throws {Error} When the URL, or a redirect target, is not a Bandcamp address.
 * @throws {UpstreamUnavailableError} When `curl` fails, the redirect limit is
 *   reached, or the CDN answers with its client challenge. Each of these is
 *   logged as a deviation.
 */
async function request(url: string, timeoutMs: number, jsonBody?: string): Promise<Response> {
  let target = new URL(url);
  for (let redirects = 0; ; redirects += 1) {
    if (!isBandcampUrl(target)) {
      log.deviation({
        component: LOG_COMPONENT,
        errorCode: LOG_ERROR_CODE,
        operation: LOG_OPERATION,
        outcome: "blocked_target",
        host: target.hostname,
        redirects,
      });
      throw new Error("Blocked non-Bandcamp request target");
    }

    let output: CurlOutput;
    try {
      output = await curlRunner.run(curlArguments(target, timeoutMs, jsonBody), timeoutMs + PROCESS_KILL_GRACE_MS);
    } catch (error) {
      throw unavailable(target, "curl_failed", "Bandcamp request failed", {}, error);
    }

    const answer = readHopAnswer(output);
    if (REDIRECT_STATUSES.has(answer.status) && answer.redirectUrl !== "") {
      if (redirects >= MAX_REDIRECTS) {
        throw unavailable(target, "redirect_limit", "Bandcamp redirected too often", { status: answer.status });
      }
      target = new URL(answer.redirectUrl, target);
      continue;
    }

    if (isClientChallenge(answer.body)) {
      throw unavailable(target, "client_challenge", "Bandcamp answered with a client challenge", {
        status: answer.status,
        bodyBytes: answer.body.length,
      });
    }

    return new Response(answer.body, {
      status: answer.status,
      headers: answer.contentType === "" ? {} : { "content-type": answer.contentType },
    });
  }
}

/**
 * The Bandcamp adapter's way to the network. It is an object so tests can
 * replace `request`, which a module namespace does not allow.
 */
export const bandcampTransport = { request };
