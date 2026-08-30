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
 * somewhere the API does not answer.
 */
import { ENDPOINTS } from "@musiccloud/shared";

/** Where the published API answers. The same base the API reference documents. */
export const PUBLIC_API_BASE_URL = "https://api.musiccloud.io";

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
 * They call `POST /api/v1/resolve`, which is the authenticated counterpart of
 * the keyless `GET`, so the request actually exercises the key rather than
 * succeeding without it.
 *
 * @returns One snippet per form, plain HTTP first.
 */
export function firstRequestSnippets(): QuickstartSnippet[] {
  const url = publicUrl(ENDPOINTS.v1.resolve);
  const body = '{"url":"https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L"}';

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

/**
 * The keyless endpoint, named for what it is.
 *
 * It is mentioned rather than hidden, because a developer who only wants to
 * resolve one link from a shortcut does not need a key at all, and finding
 * that out later is finding out we did not say.
 *
 * @returns The endpoint, its budget, and the sentence that goes with it.
 */
export function keylessNote(): { url: string; text: string } {
  return {
    url: publicUrl(ENDPOINTS.v1.resolve),
    text: "One endpoint needs no key at all: the GET form of the same path. It allows 10 requests a minute and 500 a day per address, which suits a shortcut or a one-off script and not a service. Anything beyond your own use belongs on the POST above, where the quota comes from your project's plan.",
  };
}
