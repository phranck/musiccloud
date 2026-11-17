/**
 * @file Who carries this year's running costs, as a moving row of cards.
 *
 * Ported from lmaa.space (`apps/frontend/src/components/SponsorWall.astro` and
 * its two scripts). lmaa renders the wall on the server; here the backend
 * renders only the texts into the page, and the wall reads the sponsors from
 * the site's own `/api/sponsors` once it is mounted, because who is on it and
 * how many days each has left change by the day.
 */

import {
  CENTS_PER_EURO,
  fundingProgress,
  type PublicSponsor,
  SPONSOR_WALL_DEFAULTS,
  SPONSOR_WALL_MISSING_PLACEHOLDER,
  type SponsorsPayload,
  type SponsorWallConfig,
  SupportIntervalKey,
  sponsorDaysLeft,
  utcDay,
} from "@musiccloud/shared";
import { HeartIcon, SealIcon } from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { fetchCurrentSponsors } from "@/lib/support/sponsors";
import { cn } from "@/lib/utils";

import { formatEuro } from "./amountInput";
import { LadderRichText } from "./LadderRichText";
import { SponsorCard } from "./SponsorCard";
import { chooseSupportInterval } from "./supportLadderEvents";

/**
 * How many cards fit across before the row starts to move: 2. Two and a half
 * cards fit across the content, so from the third one on there is more than
 * can be seen at once and the row carries itself past the reader.
 */
const STILL_CARD_LIMIT = 2;

/** How long the row takes to come to a stand or back to speed, in milliseconds: 700. */
const RAMP_MS = 700;

/** The language the site writes its days in, as it writes its amounts. */
const DATE_LOCALE = "en-GB";

/** The day a sponsorship began, written out: `7 November 2026`. */
const LONG_DAY = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The same day in figures, for a card too narrow for the month's name: `07/11/2026`. */
const SHORT_DAY = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** Props of {@link SponsorWall}. */
export interface SponsorWallProps {
  /** The page's texts, as the shared reader returned them from the marker. */
  config: SponsorWallConfig;
}

/**
 * What one card says about its sponsorship: the day it began and what is left.
 *
 * @param sponsor - The sponsor.
 * @param today - The current day in UTC, `YYYY-MM-DD`, as the backend counts it.
 * @returns The day written out, in figures, and the days left as a phrase.
 */
function termOf(sponsor: PublicSponsor, today: string) {
  const left = sponsorDaysLeft(sponsor.paidOn, today);
  const day = new Date(`${sponsor.paidOn}T00:00:00Z`);
  return {
    since: LONG_DAY.format(day),
    sinceShort: SHORT_DAY.format(day),
    left: left === 1 ? "1 day left" : `${left} days left`,
  };
}

/**
 * Smoothstep, so the row's ramp starts and ends without a corner.
 *
 * @param progress - How far the ramp has run, from 0 to 1.
 * @returns The eased share of the change, from 0 to 1.
 */
function ease(progress: number): number {
  return progress * progress * (3 - 2 * progress);
}

/**
 * Lets a moving row come to a stand rather than stop dead, under the pointer
 * and under the focus.
 *
 * Pausing an animation takes effect on the next frame, which reads as the row
 * hitting a wall. Easing its playback rate down to nothing over
 * {@link RAMP_MS}, and back up on leaving, keeps the movement believable. Only
 * the rate is driven frame by frame, and only while it changes. Where the
 * reader prefers reduced motion there is no animation, and this finds nothing
 * to slow.
 *
 * @param railRef - The row, whose track carries the animation.
 * @param moving - Whether the row moves at all.
 */
function useEasedStop(railRef: React.RefObject<HTMLDivElement | null>, moving: boolean): void {
  useEffect(() => {
    const rail = railRef.current;
    if (!moving || !rail) return;
    let frame = 0;

    // The animation is looked up when the pointer arrives rather than once,
    // because a stylesheet arriving later leaves nothing to look up early.
    const rampTo = (target: number) => {
      const animation = rail.querySelector<HTMLElement>(".mc-sponsor-wall__track")?.getAnimations()[0];
      if (!animation) return;
      const from = animation.playbackRate;
      const startedAt = performance.now();
      cancelAnimationFrame(frame);
      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / RAMP_MS, 1);
        animation.playbackRate = from + (target - from) * ease(progress);
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const stop = () => rampTo(0);
    const go = () => rampTo(1);
    rail.addEventListener("pointerenter", stop);
    rail.addEventListener("pointerleave", go);
    rail.addEventListener("focusin", stop);
    rail.addEventListener("focusout", go);
    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener("pointerenter", stop);
      rail.removeEventListener("pointerleave", go);
      rail.removeEventListener("focusin", stop);
      rail.removeEventListener("focusout", go);
    };
  }, [railRef, moving]);
}

/**
 * The sponsor wall: an introduction, a row of cards, and a sentence on how
 * much of the year is covered.
 *
 * Nothing is drawn until the sponsors have arrived, and nothing at all when
 * they cannot be read, because a wall that flashes a placeholder and then
 * fills reads as broken. With no sponsor, a placeholder card in the shape of a
 * card invites the first one; its button opens the ladder's sponsor tab.
 *
 * @param props - See {@link SponsorWallProps}.
 * @returns The wall, or nothing while the sponsors are unknown.
 */
export function SponsorWall({ config }: SponsorWallProps) {
  const [payload, setPayload] = useState<SponsorsPayload | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const moving = (payload?.sponsors.length ?? 0) > STILL_CARD_LIMIT;
  useEasedStop(railRef, moving);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCurrentSponsors(controller.signal)
      .then(setPayload)
      .catch(() => setPayload(null));
    return () => controller.abort();
  }, []);

  if (!payload) return null;

  const text = {
    text: config.text || SPONSOR_WALL_DEFAULTS.text,
    covered: config.covered || SPONSOR_WALL_DEFAULTS.covered,
    missing: config.missing || SPONSOR_WALL_DEFAULTS.missing,
    empty: config.empty || SPONSOR_WALL_DEFAULTS.empty,
    emptyAction: config.emptyAction || SPONSOR_WALL_DEFAULTS.emptyAction,
  };
  const funding = fundingProgress(payload.costsTotalCents, payload.coveredCents);
  const costsLine =
    funding.missingCents === 0
      ? text.covered
      : text.missing.replaceAll(SPONSOR_WALL_MISSING_PLACEHOLDER, formatEuro(funding.missingCents / CENTS_PER_EURO));
  const today = utcDay();
  const cards = payload.sponsors.map((sponsor) => ({ sponsor, ...termOf(sponsor, today) }));

  return (
    <section className="mc-sponsor-wall my-[var(--mc-gap-cards,1.5rem)] flex flex-col gap-[var(--mc-gap-cards,1.5rem)]">
      <LadderRichText html={text.text} className="text-sm text-text-secondary" />

      {cards.length === 0 ? (
        <RecessedCard className="mc-sponsor-wall__empty">
          {/* The place the first card will take, drawn as that card: the medal
              where the picture goes, and beside it the lines a name and a
              sentence will fill. */}
          <div className="mc-sponsor-wall__empty-figure" aria-hidden="true">
            <span className="mc-sponsor-wall__seat">
              <SealIcon weight="duotone" className="mc-sponsor-wall__medal" />
              <span className="mc-sponsor-wall__numeral">1</span>
            </span>
            <span className="mc-sponsor-wall__lines">
              <span className="mc-sponsor-wall__line is-name" />
              <span className="mc-sponsor-wall__line" />
              <span className="mc-sponsor-wall__line is-short" />
            </span>
          </div>
          <div className="mc-sponsor-wall__empty-body">
            <LadderRichText html={text.empty} className="mc-sponsor-wall__empty-text" />
            <div className="text-sm font-semibold text-text-primary">
              <EmbossedButton
                as="button"
                className="inline-flex items-center gap-2"
                onClick={() => chooseSupportInterval(SupportIntervalKey.Sponsor)}
              >
                <HeartIcon weight="fill" aria-hidden="true" className="size-4" />
                {text.emptyAction}
              </EmbossedButton>
            </div>
          </div>
        </RecessedCard>
      ) : (
        <div
          ref={railRef}
          className={cn("mc-sponsor-wall__rail", moving && "is-moving")}
          style={{ "--mc-sponsor-count": cards.length } as CSSProperties}
        >
          {/* Both runs stand in one list, because that is what makes the loop
              exact: every card carries the same trailing space, so one run is
              a whole number of equal steps and the loop moves by exactly one. */}
          <ul className="mc-sponsor-wall__track">
            {cards.map((card) => (
              <SponsorCard key={card.sponsor.id} {...card} />
            ))}
            {moving && cards.map((card) => <SponsorCard key={`${card.sponsor.id}-copy`} {...card} duplicate />)}
          </ul>
        </div>
      )}

      {payload.costsTotalCents > 0 && <LadderRichText html={costsLine} className="text-sm text-text-secondary" />}
    </section>
  );
}
