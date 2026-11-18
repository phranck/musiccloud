import { DashboardButton, DashboardButtonVariant, DashboardDatePicker } from "@musiccloud/dashboard-ui";
import { BANK_CONNECTION_DASHBOARD_PATH, BankErrorCode, groupIban } from "@musiccloud/shared";
import { ArrowsClockwiseIcon, BankIcon, PlugsConnectedIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { dashboardCopy } from "@/copy/dashboard";
import { useAuth } from "@/features/auth/AuthContext";
import { fetchSponsoringConfig, SPONSORING_CONFIG_QUERY_KEY } from "@/features/sponsoring/api";
import { BankConnectionStateBadge } from "@/features/sponsoring/BankConnectionStateBadge";
import { BankFailureMessage } from "@/features/sponsoring/BankFailureMessage";
import { resolveBankConnectionState } from "@/features/sponsoring/bankConnectionState";
import { useBankConnection, useSyncBank } from "@/features/sponsoring/useBankConnection";
import { formatEnglishDate } from "@/lib/format";
import { useRememberedFlag } from "@/lib/useRememberedFlag";
import { AdminArea, canAccessArea } from "@/shared/constants/domain";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The bank connection's copy. */
const text = messages.sponsoring.bankConnection;

/**
 * The browser store key under which this browser remembers whether the card
 * stands open, `"true"` or `"false"`; absent, it stands closed.
 */
const EXPANDED_STORAGE_KEY = "bank-connection-card-open";

/** How the card writes the consent's end: the month spelled out, as the bank connection page does. */
const DATE_STYLE: Intl.DateTimeFormatOptions = { dateStyle: "long" };

/** How the card writes a read's moment: the day and the minute. */
const DATE_TIME_STYLE: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };

/**
 * The sentence each failure a read can be recorded with stands for. Keyed by
 * the backend's code, so a background read's failure reads the same as one of
 * Read now; a code not listed here reads as the unknown one.
 */
const READ_FAILURE_TEXT: Readonly<Partial<Record<string, string>>> = {
  [BankErrorCode.RequestRefused]: text.readFailures.requestRefused,
  [BankErrorCode.Unreachable]: text.readFailures.unreachable,
  [BankErrorCode.BadAnswer]: text.readFailures.badAnswer,
  [BankErrorCode.BadDestination]: text.readFailures.badDestination,
  [BankErrorCode.NotConfigured]: text.readFailures.notConfigured,
  [BankErrorCode.ReadFailed]: text.readFailures.unknown,
};

/** Props of {@link CardFact}. */
interface CardFactProps {
  /** What the figure names. */
  label: string;
  /** The figure. */
  children: ReactNode;
}

/**
 * One labelled figure of the card, the label above the value.
 *
 * @param props - See {@link CardFactProps}.
 * @returns The figure.
 */
function CardFact({ label, children }: CardFactProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[var(--ds-text-muted)]">{label}</span>
      <span className="text-sm text-[var(--ds-text)]">{children}</span>
    </div>
  );
}

/** Props of {@link BankConnectionCard}. */
interface BankConnectionCardProps {
  /** Classes for the card's outer section, such as its distance to what follows. Empty by default. */
  className?: string;
}

/**
 * The bank connection, beside the ledger it keeps up to date, ported from
 * lmaa.space's `BankConnectionCard.tsx`.
 *
 * It stands on the donations page rather than only on its own page, because
 * this is where the consequence shows: a lapsed consent leaves every figure
 * standing still, and a badge nobody goes looking for is a badge nobody reads.
 * The header carries when the account was last read and when it is read next,
 * with the connection's state, because those are what the card is opened to
 * find out; the body, folded away until somebody opens it and remembered per
 * browser, names the bank, the account and the consent's end, and says why the
 * last read failed in the card's own words.
 *
 * The footer is the owner's alone, as the routes behind it are: the day a read
 * starts at, Connect or Renew, which leads to the bank connection page, and
 * Read now, which stays off while nothing is connected or a read is running.
 * A Read now that the backend refused says so with its code and error id.
 *
 * @param props - See {@link BankConnectionCardProps}.
 * @returns The card, or nothing while the deployment holds no credential at all.
 */
export function BankConnectionCard({ className = "" }: BankConnectionCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canAct = canAccessArea(user?.role, AdminArea.BankConnection);

  const { data: status } = useBankConnection();
  // The account this connection reads, as its owner knows it. Kept in the
  // sponsoring settings, because that is where it is entered.
  const { data: config } = useQuery({ queryKey: SPONSORING_CONFIG_QUERY_KEY, queryFn: fetchSponsoringConfig });
  const sync = useSyncBank();
  // The wording of one question being asked now rather than a view of the page
  // worth returning to, so it is held here and not in the address bar.
  const [syncFrom, setSyncFrom] = useState("");
  // Closed until somebody opens it. The card answers whether the list beneath
  // it is current, which is asked occasionally, while the list is what the
  // page is for.
  const [expanded, setExpanded] = useRememberedFlag(EXPANDED_STORAGE_KEY, false);

  if (!status?.configured) return null;

  const state = resolveBankConnectionState(status, new Date());
  // What a successful read did, with the completions named only where there
  // were any: "0 completed" on every ordinary read is a figure nobody needs.
  const lastRunOutcome = status.lastReadSucceeded
    ? [
        `${status.lastReadImported} ${text.lastReadImported}`,
        ...(status.lastReadFilled > 0 ? [`${status.lastReadFilled} ${text.lastReadFilled}`] : []),
      ].join(", ")
    : text.lastReadFailed;
  const lastRun = status.lastReadAt
    ? `${formatEnglishDate(status.lastReadAt, DATE_TIME_STYLE)} · ${lastRunOutcome}`
    : text.lastReadNever;
  // A time that is not in the future says the read is due rather than naming a
  // minute that has passed, which is how the backend answers an empty window.
  const nextRunAt = status.nextReadAt ? new Date(status.nextReadAt) : null;
  const nextRun = nextRunAt
    ? nextRunAt.getTime() > Date.now()
      ? formatEnglishDate(nextRunAt, DATE_TIME_STYLE)
      : text.nextReadDue
    : text.valueAbsent;
  const failure =
    status.lastReadSucceeded === false && status.lastReadFailure
      ? (READ_FAILURE_TEXT[status.lastReadFailure] ?? text.readFailures.unknown)
      : null;

  return (
    <DashboardSection
      expanded={expanded}
      onExpandedChange={setExpanded}
      collapseButtonLabel={text.cardTitle}
      className={className}
    >
      <DashboardSection.Header
        icon={<BankIcon weight="duotone" className="size-4" />}
        title={text.cardTitle}
        renderAddOn={() => (
          <>
            <div className="flex items-start gap-x-8 whitespace-nowrap">
              <CardFact label={text.lastReadLabel}>{lastRun}</CardFact>
              <CardFact label={text.nextReadLabel}>{nextRun}</CardFact>
            </div>
            <BankConnectionStateBadge state={state} />
          </>
        )}
      />
      <DashboardSection.Body>
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <CardFact label={text.institutionLabel}>
            {status.connected ? `${status.institutionName} (${status.institutionCountry})` : text.valueAbsent}
          </CardFact>
          <CardFact label={text.accountLabel}>
            {config?.payeeIban ? groupIban(config.payeeIban) : text.valueAbsent}
          </CardFact>
          <CardFact label={text.consentValidUntilLabel}>
            {status.consentValidUntil ? formatEnglishDate(status.consentValidUntil, DATE_STYLE) : text.valueAbsent}
          </CardFact>
        </div>

        {/* What the bank said takes precedence over the general sentence,
            which covers every cause there is and names none of them. */}
        {failure ? (
          <p className="text-sm text-[var(--ds-danger-text)]">{failure}</p>
        ) : (
          sync.isError && <BankFailureMessage message={text.syncFailed} error={sync.error} />
        )}
      </DashboardSection.Body>

      {canAct && (
        <DashboardSection.Footer className="flex-wrap items-end">
          {/* Away from the buttons: it is what the read is asked for rather
              than an action, and the buttons keep the corner a reader looks in. */}
          <div className="mr-auto">
            <DashboardDatePicker
              id="bank-connection-sync-from"
              label={text.syncFromLabel}
              hint={text.syncFromHint}
              placeholder={messages.common.pickDate}
              clearLabel={messages.common.clear}
              value={syncFrom}
              onChange={setSyncFrom}
            />
          </div>
          <DashboardButton
            size="control"
            leadingIcon={<PlugsConnectedIcon weight="duotone" className="size-4" />}
            onClick={() => void navigate(BANK_CONNECTION_DASHBOARD_PATH)}
          >
            {status.connected ? text.renew : text.connect}
          </DashboardButton>
          <DashboardButton
            variant={DashboardButtonVariant.Primary}
            size="control"
            disabled={!status.connected || sync.isPending}
            leadingIcon={<ArrowsClockwiseIcon weight="duotone" className="size-4" />}
            onClick={() => sync.mutate(syncFrom ? { from: syncFrom } : {})}
          >
            {sync.isPending ? text.syncing : text.syncNow}
          </DashboardButton>
        </DashboardSection.Footer>
      )}
    </DashboardSection>
  );
}
