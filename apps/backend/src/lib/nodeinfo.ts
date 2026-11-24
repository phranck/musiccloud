/**
 * @file Asks a host which software it runs, through NodeInfo.
 *
 * Ported from lmaa.space `apps/backend/src/lib/og.ts` for the sponsorship
 * intake. Both requests go through `fetchExternalResource`, so neither can
 * reach a private address, and bodies are read under a byte budget.
 */
import type { SocialPlatformKey } from "@musiccloud/shared";
import { fetchExternalResource, HEADERS, hostForLog, LOG_COMPONENT, LOG_ERROR_CODE } from "./external-resource.js";
import { readJsonWithLimit } from "./http-body.js";
import { log } from "./infra/logger.js";

/**
 * The software names NodeInfo reports, against the platform key they mean.
 *
 * Only names that have been seen answering are in here. A host running
 * something else is left alone rather than guessed at.
 */
const SOFTWARE_TO_PLATFORM: Readonly<Record<string, SocialPlatformKey>> = {
  pixelfed: "pixelfed",
  mastodon: "mastodon",
  friendica: "friendica",
};

/** How long each of the two NodeInfo requests may take: 6 seconds. */
const NODEINFO_TIMEOUT_MS = 6000;

/** The largest NodeInfo document read: 64 KiB. NodeInfo documents are small; anything larger is not one. */
const MAX_NODEINFO_BYTES = 64 * 1024;

/** Where every host that speaks NodeInfo lists its documents. */
const NODEINFO_INDEX_PATH = "/.well-known/nodeinfo";

/**
 * Asks a host which software it runs, through NodeInfo.
 *
 * A service anybody can host sits on a domain of its own and its profiles are a
 * single path segment, which is what a personal website looks like too, so the
 * address cannot say what it is. Its own pages cannot be trusted to either:
 * measured across twelve Pixelfed instances on 2026-08-24, their landing pages
 * carried no `generator` at all and their `og:site_name` was whatever the
 * operator had named the place, from "Pixey" to "FediSnap".
 *
 * NodeInfo is the fediverse's own answer to this question. All twelve reported
 * `pixelfed` with a version, and it is the same query for Mastodon or anything
 * else that speaks it.
 *
 * Two requests: the well-known document lists where the real one lives, and the
 * real one carries the software name. Both go through
 * {@link fetchExternalResource}, so neither can reach a private address.
 *
 * @param address - Any address on the host in question.
 * @returns The platform key, or `null` when the host speaks no NodeInfo or runs
 *   something not mapped in {@link SOFTWARE_TO_PLATFORM}.
 */
export async function detectPlatformFromHost(address: string): Promise<SocialPlatformKey | null> {
  let origin: string;
  try {
    origin = new URL(address).origin;
  } catch {
    return null;
  }

  const index = await fetchNodeinfoJson<{ links?: unknown }>(`${origin}${NODEINFO_INDEX_PATH}`);
  if (!index || !Array.isArray(index.links)) return null;

  // The last link is the newest schema the host offers, which is the one to ask.
  const hrefs = index.links
    .map((link) => (link && typeof link === "object" ? (link as Record<string, unknown>).href : undefined))
    .filter((href): href is string => typeof href === "string");
  const href = hrefs.at(-1);
  if (!href) return null;

  const document = await fetchNodeinfoJson<{ software?: unknown }>(href);
  const software = document?.software;
  const name = software && typeof software === "object" ? (software as Record<string, unknown>).name : undefined;
  if (typeof name !== "string") return null;

  return SOFTWARE_TO_PLATFORM[name.trim().toLowerCase()] ?? null;
}

/**
 * Reads one NodeInfo document.
 *
 * @param url - The document's address.
 * @returns The parsed body, or `null` on any failure, including a body over
 *   {@link MAX_NODEINFO_BYTES}.
 */
async function fetchNodeinfoJson<T>(url: string): Promise<T | null> {
  const result = await fetchExternalResource(
    url,
    { headers: { "User-Agent": HEADERS["User-Agent"], Accept: "application/json" } },
    NODEINFO_TIMEOUT_MS,
  );
  if (!result?.response.ok) return null;
  try {
    return await readJsonWithLimit<T>(result.response, MAX_NODEINFO_BYTES);
  } catch (error) {
    log.deviation(
      {
        component: LOG_COMPONENT,
        errorCode: LOG_ERROR_CODE,
        operation: "nodeinfo_lookup",
        outcome: "document_unreadable",
        host: hostForLog(url),
      },
      error,
    );
    return null;
  }
}
