/**
 * URL safety check for user-configurable links (nav items, footer, etc.).
 * Allows https:// always, http:// only on loopback hosts, and optionally
 * relative paths, hash fragments, mailto:, tel:.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export type SafeUrlOptions = {
  allowRelative?: boolean;
  allowHash?: boolean;
  allowMailto?: boolean;
  allowTel?: boolean;
};

/**
 * Whether a value is a path on this site, such as `/` or `/docs`.
 *
 * A second `/` makes it a protocol-relative address on another host, and a
 * `\` does the same, because browsers read a backslash in an `http` or
 * `https` URL as a slash: `/\example.com` on this site opens
 * `https://example.com/`.
 *
 * @param value - The address as written, already trimmed by the caller.
 * @returns `true` when the value starts with `/` and the next character, if
 *   any, is neither `/` nor `\`.
 */
export function isSameSiteRelativePath(value: string): boolean {
  return value.startsWith("/") && value[1] !== "/" && value[1] !== "\\";
}

/**
 * Whether a configured link is safe to store and render.
 *
 * @param value - The link as written.
 * @param options - Which forms besides `https` (and `http` on loopback) are allowed.
 * @returns Whether the link is one of the allowed forms.
 */
export function isSafeConfiguredUrl(value: string, options: SafeUrlOptions = {}): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (options.allowRelative && isSameSiteRelativePath(trimmed)) {
    return true;
  }

  if (options.allowHash && trimmed.startsWith("#")) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    switch (parsed.protocol) {
      case "https:":
        return true;
      case "http:":
        return isLoopbackHost(parsed.hostname);
      case "mailto:":
        return options.allowMailto ?? false;
      case "tel:":
        return options.allowTel ?? false;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Whether a value may stand as a navigation link.
 *
 * Navigation accepts a path on this site, an `https` address, `http` on a
 * loopback host and `mailto:`. The API, the dashboard form, the backfill and
 * the site all ask this, so a link one of them accepts is a link all of them
 * render.
 *
 * @param value - The link as stored or typed.
 * @returns Whether it may be stored and rendered as a navigation link.
 */
export function isSafeNavigationUrl(value: string): boolean {
  return isSafeConfiguredUrl(value, { allowRelative: true, allowMailto: true });
}

/**
 * Whether a page body may point a button, a picture or a PDF at an address.
 *
 * A page may point at this site or at an `https` address, which is where a
 * reader can already go. The address is written by an editor rather than
 * checked by a form, so the same-site rule here is the one navigation uses.
 *
 * @param value - The address after the shortcode's colon or in its `action`.
 * @returns Whether the address may reach an attribute.
 */
export function isSafeContentTarget(value: string): boolean {
  return isSameSiteRelativePath(value) || value.startsWith("https://");
}
