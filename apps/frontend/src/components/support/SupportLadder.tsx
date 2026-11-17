/**
 * @file The support ladder: amounts to give, and the ways to give them.
 */

import {
  SPONSOR_FORM_DEFAULTS,
  SUPPORT_LADDER_LABEL_DEFAULTS,
  SupportIntervalKey,
  type SupportIntervalKeyValue,
  type SupportLadderConfig,
  SupportRouteToken,
  type SupportRouteTokenValue,
} from "@musiccloud/shared";
import { type CSSProperties, useEffect, useEffectEvent, useReducer, useRef, useSyncExternalStore } from "react";

import { EmbossedSegmentedControl, type Segment } from "@/components/ui/EmbossedSegmentedControl";
import { prefersReducedMotion } from "@/lib/motion/setup";
import {
  getIssuedSponsorship,
  getServerIssuedSponsorship,
  subscribeIssuedSponsorship,
} from "@/lib/support/pending-sponsorship-store";
import { cn } from "@/lib/utils";

import { formatEuro, normalizeAmountInput, readAmountInput } from "./amountInput";
import { LadderNotice } from "./LadderNotice";
import { LadderRichText } from "./LadderRichText";
import { SponsorStep } from "./SponsorForm";
import { AmountGrid } from "./SupportLadderAmounts";
import { RouteCard } from "./SupportLadderRoutes";
import { TransferCard } from "./SupportLadderTransfer";
import { CHOOSE_SUPPORT_INTERVAL_EVENT, type ChooseSupportIntervalDetail } from "./supportLadderEvents";
import {
  floorFor,
  initialSupportLadderState,
  SupportLadderActionType,
  supportLadderReducer,
} from "./supportLadderState";

/** Months in a year, which a monthly amount is multiplied by for its yearly total: 12. */
const MONTHS_PER_YEAR = 12;

/**
 * How long the body fades before it shows the tab just chosen, in milliseconds:
 * 140. Long enough to read as a change of scene, short enough that nobody waits.
 * The stylesheet's transition reads it through `--mc-support-ladder-fade`.
 */
const BODY_FADE_MS = 140;

/** What a tab's text writes for the yearly total of the chosen amount: `{annualAmount}`. */
const YEARLY_TOTAL_PLACEHOLDER = "{annualAmount}";

/** What the sponsor tab's notice writes for the sponsor minimum: `{min}`. */
const MINIMUM_PLACEHOLDER = "{min}";

/**
 * The tabs each route out of the page stands under.
 *
 * PayPal.Me pays once, so it stands under the single payment only. GitHub
 * Sponsors carries a real subscription and stands under both. A sponsorship goes
 * by transfer alone, because the name on the statement is what the year is
 * recorded against, so the sponsor tab shows neither.
 */
const ROUTE_TABS: Record<SupportRouteTokenValue, readonly SupportIntervalKeyValue[]> = {
  [SupportRouteToken.PaypalMe]: [SupportIntervalKey.Once],
  [SupportRouteToken.GithubSponsors]: [SupportIntervalKey.Once, SupportIntervalKey.Monthly],
};

/** Props of {@link SupportLadder}. */
export interface SupportLadderProps {
  /** The ladder, as the shared reader returned it from the page's marker. */
  config: SupportLadderConfig;
}

/**
 * The amount ladder and the payment details of the support page.
 *
 * A tab switch chooses how often to give, a grid of amounts says what each one
 * pays for, and below them stand the transfer with its GiroCode and the routes
 * out. Choosing a tab moves the switch at once; the body fades and returns as
 * the new tab, so two tabs are never half visible together. With reduced motion
 * the body changes at once.
 *
 * The GiroCode is drawn for a single payment and a sponsorship only, because
 * EPC069-12 has no field for an interval and cannot express a standing order.
 * The monthly tab shows the same details as text.
 *
 * Where the page names a `[[sponsorform]]` in the transfer card's variant for
 * the tab in view, the tab asks for the sponsor's details between the amount
 * and the transfer, and from the sponsor minimum up the transfer carries the
 * payment reference the form issued in place of the purpose.
 *
 * @param props - See {@link SupportLadderProps}.
 * @returns The ladder.
 */
export function SupportLadder({ config }: SupportLadderProps) {
  const { intervals, bankAccount, routes, payee, minSponsorAmountEur } = config;
  const text = { ...SUPPORT_LADDER_LABEL_DEFAULTS, ...config.labels };

  const [state, dispatch] = useReducer(supportLadderReducer, undefined, () =>
    initialSupportLadderState(intervals, minSponsorAmountEur),
  );
  const { intervalKey, shownKey, amountEur, customAmount } = state;
  const interval = intervals.find((entry) => entry.key === shownKey) ?? intervals[0];
  const floorEur = floorFor(shownKey, minSponsorAmountEur);
  const swapTimer = useRef<number | null>(null);

  const sectionRef = useRef<HTMLElement>(null);

  // The reference this browser was given, if any. It lives in the browser
  // rather than here, so the page renders on the server without it and a second
  // tab of the site does not go on showing a reference this one replaced.
  const issued = useSyncExternalStore(subscribeIssuedSponsorship, getIssuedSponsorship, getServerIssuedSponsorship);

  useEffect(
    () => () => {
      if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
    },
    [],
  );

  // Something else on the page, such as the sponsor wall's placeholder, asks
  // for a tab. The ladder takes the request only for a tab it has, which it
  // signals by cancelling the event, and comes into view on it.
  const openRequestedTab = useEffectEvent((event: Event) => {
    const { key } = (event as CustomEvent<ChooseSupportIntervalDetail>).detail;
    if (!intervals.some((entry) => entry.key === key)) return;
    event.preventDefault();
    chooseInterval(key);
    sectionRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  });

  useEffect(() => {
    const listener = (event: Event) => openRequestedTab(event);
    window.addEventListener(CHOOSE_SUPPORT_INTERVAL_EVENT, listener);
    return () => window.removeEventListener(CHOOSE_SUPPORT_INTERVAL_EVENT, listener);
  }, []);

  function chooseInterval(key: SupportIntervalKeyValue) {
    if (key === intervalKey) return;
    dispatch({ type: SupportLadderActionType.ChooseInterval, key });

    const show = () => {
      swapTimer.current = null;
      dispatch({
        type: SupportLadderActionType.ShowInterval,
        key,
        interval: intervals.find((entry) => entry.key === key),
        floorEur: floorFor(key, minSponsorAmountEur),
      });
    };
    if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
    if (prefersReducedMotion()) show();
    else swapTimer.current = window.setTimeout(show, BODY_FADE_MS);
  }

  function enterCustom(value: string) {
    const cleaned = normalizeAmountInput(value);
    dispatch({
      type: SupportLadderActionType.EnterCustom,
      cleaned,
      amountEur: cleaned === "" ? null : readAmountInput(cleaned),
      interval,
      floorEur,
    });
  }

  if (!interval) return null;

  const segments: Segment<SupportIntervalKeyValue>[] = intervals.map((entry) => ({
    key: entry.key,
    label: entry.label,
  }));
  const intervalText = interval.text.replaceAll(YEARLY_TOTAL_PLACEHOLDER, formatEuro(amountEur * MONTHS_PER_YEAR));
  const minimumNotice = interval.belowMinimum.replaceAll(MINIMUM_PLACEHOLDER, formatEuro(floorEur));

  // A tab without a transfer block of its own borrows the single payment's,
  // which is the same transfer with a different purpose, and the code keeps
  // the single payment's look unless the tab restates it.
  const onceVariant = bankAccount?.variants.find((entry) => entry.key === SupportIntervalKey.Once);
  const variant = bankAccount?.variants.find((entry) => entry.key === shownKey) ?? onceVariant;
  const hasPayee = payee.name !== "" && payee.iban !== "";
  // The wording of the form, when the transfer card in view carries one. Its
  // presence decides whether this tab asks anything of the reader at all, so
  // the page says where the form belongs, by naming a `[[sponsorform]]` in a
  // variant, rather than the component deciding it from a key.
  const sponsorFormText = variant?.sponsorForm ? { ...SPONSOR_FORM_DEFAULTS, ...variant.sponsorForm } : null;
  // Whether what stands on the ladder buys a sponsorship at all. Only a tab
  // with a form can announce one, and below the minimum the payment is a
  // donation whatever was announced, so the form and the amount rather than
  // the tab decide both the reference and the words on the transfer.
  const earnsSponsorship = sponsorFormText !== null && minSponsorAmountEur > 0 && amountEur >= minSponsorAmountEur;
  const remittance =
    (earnsSponsorship ? bankAccount?.purposeSponsor : undefined) || (bankAccount?.purposeDonation ?? "");

  return (
    <section
      ref={sectionRef}
      className="mc-support-ladder my-[var(--mc-gap-cards,1.5rem)] flex flex-col gap-[var(--mc-gap-cards,1.5rem)]"
    >
      {(segments.length > 1 || intervalText !== "") && (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {intervalText && (
            <LadderRichText html={intervalText} className="min-w-0 flex-1 text-sm text-text-secondary" />
          )}
          {segments.length > 1 && (
            <fieldset className="m-0 ml-auto min-w-0 border-0 p-0">
              <legend className="sr-only">{text.frequencyGroup}</legend>
              <EmbossedSegmentedControl segments={segments} value={intervalKey} onChange={chooseInterval} />
            </fieldset>
          )}
        </div>
      )}

      <div
        className={cn(
          "mc-support-ladder__body flex flex-col gap-[var(--mc-gap-cards,1.5rem)]",
          intervalKey !== shownKey && "is-fading",
        )}
        style={{ "--mc-support-ladder-fade": `${BODY_FADE_MS}ms` } as CSSProperties}
      >
        {interval.hint && (
          <LadderNotice>
            <LadderRichText html={interval.hint} />
          </LadderNotice>
        )}

        <AmountGrid
          // A fresh tab starts without a complaint about the tab before it.
          key={shownKey}
          interval={interval}
          amountEur={amountEur}
          customAmount={customAmount}
          perMonthLabel={text.perMonth}
          minimumEur={floorEur}
          minimumNotice={minimumNotice}
          onChoose={(next) => dispatch({ type: SupportLadderActionType.ChooseAmount, amountEur: next })}
          onCustom={enterCustom}
        />

        {sponsorFormText && (
          <SponsorStep
            issued={issued}
            amountEur={amountEur}
            earnsSponsorship={earnsSponsorship}
            text={sponsorFormText}
          />
        )}

        {bankAccount && variant && hasPayee && (
          <TransferCard
            variant={variant}
            qr={variant.qr ?? onceVariant?.qr}
            payee={payee}
            amountEur={amountEur}
            amountText={formatEuro(amountEur)}
            monthly={shownKey === SupportIntervalKey.Monthly}
            remittance={remittance}
            referenceLine={earnsSponsorship}
            issued={issued}
            showQr={shownKey !== SupportIntervalKey.Monthly}
            text={text}
          />
        )}

        {routes.flatMap((route) =>
          ROUTE_TABS[route.token].includes(shownKey)
            ? [<RouteCard key={`${route.token}-${route.url}`} route={route} />]
            : [],
        )}
      </div>
    </section>
  );
}
