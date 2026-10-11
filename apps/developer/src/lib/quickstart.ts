/**
 * @file The first authenticated request, written out.
 *
 * A developer who has just been handed a key still has to work out what to do
 * with it, and working that out from a reference is a different surface with a
 * different structure that knows nothing about the registration they created.
 * These snippets close that gap.
 *
 * Every path comes from `packages/shared/src/endpoints.ts`, which is the same
 * source the backend registers its routes from, so a snippet here cannot point
 * somewhere the API does not answer. The request body is typed with the shared
 * `ResolveRequest`, which the backend's body schema is checked against, so a
 * snippet cannot send a field the API refuses.
 */
import { ENDPOINTS, type ResolveRequest } from "@musiccloud/shared";

/** Where the published API answers when nothing says otherwise. */
const DEFAULT_PUBLIC_API_BASE_URL = "https://api.musiccloud.io";

/**
 * Where the published API answers, which is what the snippets call.
 *
 * Read from `PUBLIC_API_URL` so a snippet copied out of a local portal calls
 * the local backend. A developer who pastes a snippet expects it to run against
 * the portal they took it from, and a command that quietly points at production
 * either fails on a key that does not exist there or, worse, does not.
 *
 * The default is the published address, so a deployment that sets nothing is
 * still correct.
 */
export const PUBLIC_API_BASE_URL: string =
  (import.meta.env.PUBLIC_API_URL as string | undefined)?.trim() || DEFAULT_PUBLIC_API_BASE_URL;

/** The header an issued key is sent in. */
export const API_KEY_HEADER = "X-API-Key";

/**
 * The name of the environment variable the snippets read the key from.
 *
 * The snippets read the key from the environment rather than carrying it,
 * because a command with a credential in it ends up in a shell history, and a
 * file with one in it ends up in a repository.
 */
export const API_KEY_ENV_NAME = "MUSICCLOUD_API_KEY";

/** One runnable snippet. */
export interface QuickstartSnippet {
  /** Stable id, used as the tab value and the test handle. */
  id: string;
  /** What a developer sees on the tab. */
  label: string;
  /** The code itself. */
  code: string;
}

/** The full URL of an endpoint, built from the shared path. */
function publicUrl(path: string): string {
  return `${PUBLIC_API_BASE_URL}${path}`;
}

/**
 * The snippets for the first authenticated request.
 *
 * They call `POST /api/v1/resolve`, which refuses a request without a valid
 * key, so a successful answer proves the key works.
 *
 * @returns One snippet per form, plain HTTP first.
 */
export function firstRequestSnippets(): QuickstartSnippet[] {
  const url = publicUrl(ENDPOINTS.v1.resolve);
  const requestBody: ResolveRequest = { query: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L" };
  const body = JSON.stringify(requestBody);

  return [
    {
      id: "curl",
      label: "curl",
      code: [
        `export ${API_KEY_ENV_NAME}='paste-your-key-here'`,
        "",
        `curl -X POST '${url}' \\`,
        `  -H '${API_KEY_HEADER}: '"$${API_KEY_ENV_NAME}" \\`,
        "  -H 'Content-Type: application/json' \\",
        `  -d '${body}'`,
      ].join("\n"),
    },
    {
      id: "javascript",
      label: "JavaScript",
      code: [
        `const response = await fetch("${url}", {`,
        '  method: "POST",',
        "  headers: {",
        `    "${API_KEY_HEADER}": process.env.${API_KEY_ENV_NAME},`,
        '    "Content-Type": "application/json",',
        "  },",
        `  body: JSON.stringify(${body}),`,
        "});",
        "",
        "console.log(await response.json());",
      ].join("\n"),
    },
  ];
}
