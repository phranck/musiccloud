/**
 * @file One sponsor on the sponsor wall.
 *
 * Ported from lmaa.space (`apps/frontend/src/components/SponsorCard.astro`).
 * The card is the site's content card, as the ladder's cards beside it are,
 * the picture is the copy musiccloud serves from its own origin, and the
 * sentence is plain text.
 */

import { SocialMediaIcons } from "@musiccloud/dashboard-ui/social-media";
import { ENDPOINTS, type PublicSponsor } from "@musiccloud/shared";

import { ContentCard } from "@/components/cards/ContentCard";

import { SUPPORT_TEXT_CLASS } from "./supportType";

/**
 * The side of the picture and of the initial standing in for it, in pixels: 50.
 * Both take it inline, so this is the only place the size is set.
 */
const AVATAR_SIZE_PX = 50;

/** The box {@link AVATAR_SIZE_PX} gives the picture and the initial alike. */
const AVATAR_BOX_STYLE = { width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX } as const;

/**
 * The typographic marks around a sponsor's own sentence: `“` before it and `”`
 * after it. The opening one hangs into the margin, 0.4em, so the sentence's
 * later rows line up with its first letter.
 */
const OPENING_QUOTE = "“";
/** See {@link OPENING_QUOTE}. */
const CLOSING_QUOTE = "”";

/** Props of {@link SponsorCard}. */
export interface SponsorCardProps {
  /** The sponsor as the public route returned them. */
  sponsor: PublicSponsor;
  /** The day their year began, in figures: `07/11/2026`. */
  since: string;
  /** What is left of their year, as a phrase. */
  left: string;
  /**
   * Whether this is the second run of the row rather than the first. The copy
   * says nothing a reader has not already been told, so it is kept out of the
   * reading and the tab order.
   */
  duplicate?: boolean;
}

/**
 * One sponsor: picture, name, the places they can be found, their sentence,
 * and since when and for how much longer they carry the year.
 *
 * The name is the card's heading, an `h3` under the wall's own heading, so it
 * is set in the heading face at the size of the text around it.
 *
 * The sentence is the sponsor's own words, so it stands as a quotation, a
 * `blockquote`, in italics and between quotation marks.
 *
 * A long name wraps after a whole word rather than being cut off, because
 * how much of it fits on one row depends on the browser's type. Only a
 * single word longer than the row is broken inside.
 *
 * The term sits at the foot of the card, pushed down, so cards whose
 * sentences differ in length still line up their last row.
 *
 * @param props - See {@link SponsorCardProps}.
 * @returns The card as an item of the wall's list.
 */
export function SponsorCard({ sponsor, since, left, duplicate = false }: SponsorCardProps) {
  return (
    <li className="mc-sponsor-wall__slot" aria-hidden={duplicate || undefined} inert={duplicate || undefined}>
      <ContentCard className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3">
          {sponsor.avatarId ? (
            <img
              src={ENDPOINTS.frontend.sponsorAvatar(sponsor.avatarId)}
              alt=""
              width={AVATAR_SIZE_PX}
              height={AVATAR_SIZE_PX}
              style={AVATAR_BOX_STYLE}
              className="shrink-0 rounded-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="mc-sponsor-wall__initial" style={AVATAR_BOX_STYLE} aria-hidden="true">
              {sponsor.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            {/* The type is set on the wrapper, because the wall's prose reset makes
                its headings inherit; see `.mc-sponsor-wall` in `global.css`.
                `.mc-sponsor-wall__name` trims the name to its letters, so the
                picture centers on what is visible. */}
            <div className="mc-sponsor-wall__name font-semibold break-words text-text-primary">
              <h3>{sponsor.name}</h3>
            </div>
            <SocialMediaIcons
              socialMedia={sponsor.socialMedia}
              className="mt-1 flex items-center gap-2"
              itemClassName="text-text-secondary transition-colors hover:text-text-primary"
            />
          </div>
        </div>
        {sponsor.claim && (
          <blockquote>
            <p className={`-indent-[0.4em] whitespace-pre-line pl-[0.4em] italic ${SUPPORT_TEXT_CLASS}`}>
              {OPENING_QUOTE}
              {sponsor.claim}
              {CLOSING_QUOTE}
            </p>
          </blockquote>
        )}
        <p className="mc-sponsor-wall__term">
          <span>Sponsor since {since}</span>
          <span aria-hidden="true">·</span>
          <span>{left}</span>
        </p>
      </ContentCard>
    </li>
  );
}
