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

/** The side of the picture and of the initial standing in for it, in pixels: 48. */
const AVATAR_SIZE_PX = 48;

/** Props of {@link SponsorCard}. */
export interface SponsorCardProps {
  /** The sponsor as the public route returned them. */
  sponsor: PublicSponsor;
  /** The day their year began, written out, as the wide card shows it. */
  since: string;
  /** The same day in figures, for a card too narrow for the month's name. */
  sinceShort: string;
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
 * The term sits at the foot of the card, pushed down, so cards whose
 * sentences differ in length still line up their last row.
 *
 * @param props - See {@link SponsorCardProps}.
 * @returns The card as an item of the wall's list.
 */
export function SponsorCard({ sponsor, since, sinceShort, left, duplicate = false }: SponsorCardProps) {
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
              className="size-12 shrink-0 rounded-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="mc-sponsor-wall__initial" aria-hidden="true">
              {sponsor.name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-text-primary">{sponsor.name}</span>
            <SocialMediaIcons
              socialMedia={sponsor.socialMedia}
              className="mt-1 flex items-center gap-2"
              itemClassName="text-text-secondary transition-colors hover:text-text-primary"
            />
          </span>
        </div>
        {sponsor.claim && <p className={`whitespace-pre-line ${SUPPORT_TEXT_CLASS}`}>{sponsor.claim}</p>}
        <p className="mc-sponsor-wall__term">
          <span>
            Sponsor since <span className="mc-sponsor-wall__date-long">{since}</span>
            <span className="mc-sponsor-wall__date-short">{sinceShort}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{left}</span>
        </p>
      </ContentCard>
    </li>
  );
}
