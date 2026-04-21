import { DEFAULT_LOCALE, isLocale, ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { Locale } from "@musiccloud/shared";
import type { FastifyRequest } from "fastify";
import type { FastifyInstance } from "fastify";

import { getPublicContentPage, getPublicContentPages } from "../services/admin-content.js";
import { getPublicNavItems, isValidNavId } from "../services/admin-nav.js";

/**
 * Resolve the request locale via 4-step fallback:
 * 1. `?locale=` query param (if valid Locale)
 * 2. `mc:locale` cookie (if valid Locale)
 * 3. First token of `Accept-Language` header (if valid Locale)
 * 4. DEFAULT_LOCALE
 */
function resolveRequestLocale(request: FastifyRequest<{ Querystring: { locale?: string } }>): Locale {
  // 1. Query param
  const q = request.query.locale;
  if (q && isLocale(q)) return q;

  // 2. Cookie — parse from raw Cookie header (no @fastify/cookie plugin required)
  const rawCookie = request.headers["cookie"];
  if (rawCookie) {
    for (const part of rawCookie.split(";")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) continue;
      const name = part.slice(0, eqIdx).trim();
      if (name === "mc:locale") {
        const val = part.slice(eqIdx + 1).trim();
        if (isLocale(val)) return val;
        break;
      }
    }
  }

  // 3. Accept-Language header
  const acceptLang = request.headers["accept-language"];
  if (acceptLang) {
    const first = acceptLang.split(",")[0]?.split(";")[0]?.trim();
    const tag = first?.split("-")[0]?.toLowerCase();
    if (tag && isLocale(tag)) return tag;
  }

  return DEFAULT_LOCALE;
}

const NAV_CACHE = "public, max-age=300, stale-while-revalidate=3600";
const CONTENT_CACHE = "public, max-age=3600, stale-while-revalidate=86400";

const NAV_TAGS = ["Content"];
const CONTENT_TAGS = ["Content"];

/**
 * Public-read endpoints for navigation and content pages. No auth required —
 * these feed the Astro frontend at SSR time. Cache headers are tuned for
 * CDN-friendliness: nav refreshes every 5 minutes, content pages every hour.
 */
export default async function publicContentNavRoutes(app: FastifyInstance) {
  app.get<{ Params: { navId: string }; Querystring: { locale?: string } }>(
    ROUTE_TEMPLATES.v1.nav,
    {
      schema: {
        tags: NAV_TAGS,
        summary: "Get managed navigation",
        description:
          "Returns the ordered list of items configured for the given navigation bar. Cached for 5 minutes (`stale-while-revalidate=3600`).",
        params: {
          type: "object",
          required: ["navId"],
          properties: {
            navId: {
              type: "string",
              enum: ["header", "footer"],
              description: "Which navigation to fetch — top header bar or site footer.",
            },
          },
        },
        querystring: {
          type: "object",
          properties: {
            locale: { type: "string", description: "Preferred locale (e.g. `de`). Falls back through cookie → Accept-Language → default." },
          },
        },
        response: {
          200: {
            description: "Ordered nav items for the requested bar. Empty array when nothing is configured.",
            type: "array",
            items: { $ref: "NavItem#" },
            example: [
              {
                id: 7,
                navId: "footer",
                pageSlug: "about",
                pageTitle: "About musiccloud",
                url: null,
                target: "_self",
                label: null,
                position: 0,
              },
              {
                id: 8,
                navId: "footer",
                pageSlug: "privacy",
                pageTitle: "Privacy Policy",
                url: null,
                target: "_self",
                label: null,
                position: 1,
              },
              {
                id: 9,
                navId: "footer",
                pageSlug: null,
                pageTitle: null,
                url: "https://github.com/phranck/musiccloud",
                target: "_blank",
                label: "Source on GitHub",
                position: 2,
              },
            ],
          },
          400: {
            description: "`navId` was neither `header` nor `footer`.",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (request, reply) => {
      const { navId } = request.params;
      if (!isValidNavId(navId)) {
        return reply.status(400).send({ error: "INVALID_INPUT", message: 'navId must be "header" or "footer"' });
      }
      const locale = resolveRequestLocale(request);
      reply.header("Cache-Control", NAV_CACHE);
      reply.header("Vary", "Accept-Language, Cookie");
      return getPublicNavItems(navId, locale);
    },
  );

  app.get(
    ENDPOINTS.v1.content.list,
    {
      schema: {
        tags: CONTENT_TAGS,
        summary: "List published content pages",
        description:
          "Minimal index of published content pages (slug + title only). Used by the frontend to build static route tables. Cached for 1 hour.",
        response: {
          200: {
            description: "Array of published content-page stubs, sorted alphabetically by title.",
            type: "array",
            items: {
              type: "object",
              required: ["slug", "title"],
              additionalProperties: false,
              properties: {
                slug: { type: "string" },
                title: { type: "string" },
              },
            },
            example: [
              { slug: "about", title: "About musiccloud" },
              { slug: "privacy", title: "Privacy Policy" },
              { slug: "terms", title: "Terms of Service" },
            ],
          },
        },
      },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", CONTENT_CACHE);
      return getPublicContentPages();
    },
  );

  app.get<{ Params: { slug: string }; Querystring: { locale?: string } }>(
    ROUTE_TEMPLATES.v1.contentDetail,
    {
      schema: {
        tags: CONTENT_TAGS,
        summary: "Get a published content page",
        description:
          "Returns one published content page by slug, including both the original Markdown and server-rendered HTML. Unpublished or unknown slugs yield a 404. Cached for 1 hour.",
        params: {
          type: "object",
          required: ["slug"],
          properties: {
            slug: { type: "string", description: "URL-safe identifier (e.g. `about`, `privacy`)." },
          },
        },
        querystring: {
          type: "object",
          properties: {
            locale: { type: "string", description: "Preferred locale (e.g. `de`). Falls back through cookie → Accept-Language → default." },
          },
        },
        response: {
          200: {
            description: "The published content page, ready for rendering.",
            $ref: "PublicContentPage#",
          },
          404: {
            description: "No published page exists at this slug (including draft/hidden pages).",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (request, reply) => {
      const locale = resolveRequestLocale(request);
      const page = await getPublicContentPage(request.params.slug, locale);
      if (!page) return reply.status(404).send({ error: "NOT_FOUND", message: "Content page not found" });
      reply.header("Cache-Control", CONTENT_CACHE);
      reply.header("Vary", "Accept-Language, Cookie");
      return page;
    },
  );
}
