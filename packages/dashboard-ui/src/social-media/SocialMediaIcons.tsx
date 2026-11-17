/**
 * @file The row of marks for everywhere somebody can be found.
 *
 * Ported from lmaa.space (`packages/ui/src/SocialMediaIcons.tsx`). musiccloud
 * shows no website's own mark, because that mark would have to be fetched from
 * the website and the support page asks no host but its own, so every website
 * is the globe. Every mark links, which is the one way the wall uses it. The
 * colors are handed in, because the site and the dashboard name their text
 * colors differently.
 */

import type { SocialMediaLinks } from "@musiccloud/shared";

import { PLATFORM_MAP } from "./platforms.js";

/** The side of a mark, in pixels: 20. */
const MARK_SIZE_PX = 20;

/** Props of {@link SocialMediaIcons}. */
export interface SocialMediaIconsProps {
  /** The addresses, in the order they were entered. */
  socialMedia: SocialMediaLinks;
  /** Classes of the row. Defaults to a row with a small gap. */
  className?: string;
  /** Classes of each mark, such as its color and its hover color. */
  itemClassName?: string;
}

/**
 * The row of marks for everywhere somebody can be found, each a link to its
 * address.
 *
 * The addresses appear in the order they were entered, because that order is
 * part of the data and somebody put their main address first on purpose. An
 * address whose platform is not one we know is left out rather than shown
 * without a mark. A link opens in a new tab and passes no referrer, and it is
 * named by its platform.
 *
 * @param props - See {@link SocialMediaIconsProps}.
 * @returns The row, or `null` when no address has a known platform.
 */
export function SocialMediaIcons({ socialMedia, className, itemClassName }: SocialMediaIconsProps) {
  const entries = socialMedia.flatMap((link) => {
    const platform = PLATFORM_MAP.get(link.platform);
    return platform ? [{ ...platform, url: link.url }] : [];
  });

  if (entries.length === 0) return null;

  return (
    <div className={className ?? "flex items-center gap-3"}>
      {entries.map(({ key, label, icon: Icon, url }) => (
        <a
          key={`${key}-${url}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={itemClassName}
          aria-label={label}
          title={label}
        >
          <Icon size={MARK_SIZE_PX} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
