import { DashboardButton, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { BankErrorCode } from "@musiccloud/shared";
import { BankIcon, PlugsConnectedIcon, PlugsIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import { BankConnectionStateBadge } from "@/features/sponsoring/BankConnectionStateBadge";
import { BankFailureMessage } from "@/features/sponsoring/BankFailureMessage";
import { BankConnectionState, resolveBankConnectionState } from "@/features/sponsoring/bankConnectionState";
import { leaveDashboardFor } from "@/features/sponsoring/browserNavigation";
import { RemoveConfirmDialog } from "@/features/sponsoring/RemoveConfirmDialog";
import {
  useBankConnection,
  useDisconnectBank,
  useStartBankAuthorization,
} from "@/features/sponsoring/useBankConnection";
import { formatEnglishDate } from "@/lib/format";
import { dialogHeaderIconClass } from "@/shared/ui/Dialog";
import type { ApiRequestError } from "@/shared/utils/api-error";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The bank connection's copy. */
const text = messages.sponsoring.bankConnection;

/** How the page writes a day: the month spelled out, as lmaa.space's page does. */
const DATE_STYLE: Intl.DateTimeFormatOptions = { dateStyle: "long" };

/**
 * The line that opens the disconnect dialog without naming a row, because
 * there is only ever one connection to let go.
 */
const DISCONNECT_SUMMARY = "";

/**
 * Writes a stored moment as a day, or says there is none.
 *
 * @param value - The moment, ISO 8601, or `null`.
 * @returns The day, such as `March 2, 2027`, or the copy's absent value.
 */
function formatDay(value: string | null): string {
  return value ? formatEnglishDate(value, DATE_STYLE) : text.valueAbsent;
}

/** Props of {@link StatusRow}. */
interface StatusRowProps {
  /** What the row names. */
  label: string;
  /** Its value. */
  children: ReactNode;
}

/**
 * One labelled line of the status section, the label on the left and the
 * value on the right, wrapping beneath each other where the width runs out.
 *
 * @param props - See {@link StatusRowProps}.
 * @returns The row.
 */
function StatusRow({ label, children }: StatusRowProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2">
      <span className="text-sm text-[var(--ds-text-muted)]">{label}</span>
      <span className="text-sm text-[var(--ds-text)]">{children}</span>
    </div>
  );
}

/**
 * The link to the bank account whose payments musiccloud counts, ported from
 * lmaa.space's bank connection page.
 *
 * Everything shown here comes from the backend's own database, so the page
 * still says what it knows while the bank is unreachable. Two things leave the
 * dashboard: the request that starts an authorization, which answers with an
 * address the browser is sent to, and the one that lets the account go again.
 * Both buttons stand in the header and appear only while the site holds a
 * credential. A failed start or disconnect says what it means in the page's
 * own words, followed by the backend's code and error id.
 *
 * @returns The page.
 */
export function BankConnectionPage() {
  const connectionQuery = useBankConnection();
  const startAuthorization = useStartBankAuthorization();
  const disconnect = useDisconnectBank();
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);

  const status = connectionQuery.data;
  const state = status ? resolveBankConnectionState(status, new Date()) : null;

  /** Starts an authorization and hands the browser over to the bank, which identifies the account holder. */
  function connect() {
    startAuthorization.mutate(undefined, { onSuccess: ({ url }) => leaveDashboardFor(url) });
  }

  // A failed disconnect means one of two different things, and the second one
  // has already changed the stored state, so it cannot be reported as a refusal.
  const disconnectFailure = disconnect.error as ApiRequestError | null;
  const disconnectMessage =
    disconnectFailure?.errorCode === BankErrorCode.CloseFailed ? text.disconnectPartial : text.disconnectFailed;

  return (
    <PageLayout>
      <PageHeader title={text.title}>
        {status?.configured === true && (
          <div className="flex items-center gap-2">
            {status.connected && (
              <DashboardButton
                variant={DashboardButtonVariant.Danger}
                size="control"
                disabled={disconnect.isPending}
                leadingIcon={<PlugsIcon weight="duotone" className="size-4" />}
                onClick={() => setIsConfirmingDisconnect(true)}
              >
                {text.disconnect}
              </DashboardButton>
            )}
            <DashboardButton
              variant={DashboardButtonVariant.Primary}
              size="control"
              disabled={startAuthorization.isPending}
              leadingIcon={<PlugsConnectedIcon weight="duotone" className="size-4" />}
              onClick={connect}
            >
              {status.connected ? text.renew : text.connect}
            </DashboardButton>
          </div>
        )}
      </PageHeader>

      <PageBody>
        {connectionQuery.isLoading && <ContentLoadingView className="flex-1 min-h-0" />}

        {state === BankConnectionState.Unconfigured && (
          <ContentUnavailableView
            icon={<BankIcon weight="duotone" aria-hidden />}
            title={text.unconfiguredTitle}
            subtitle={text.unconfiguredHint}
            className="flex-1 min-h-0"
          />
        )}

        {status && state !== null && state !== BankConnectionState.Unconfigured && (
          <DashboardSection>
            <DashboardSection.Header
              icon={<BankIcon weight="duotone" className="size-4" />}
              title={text.stateTitle}
              subtitle={text.stateHint}
              renderAddOn={() => <BankConnectionStateBadge state={state} />}
            />
            <DashboardSection.Body>
              <div className="divide-y divide-[var(--ds-border-subtle)]">
                <StatusRow label={text.institutionLabel}>
                  {status.connected ? `${status.institutionName} (${status.institutionCountry})` : text.valueAbsent}
                </StatusRow>
                <StatusRow label={text.connectedAtLabel}>{formatDay(status.connectedAt)}</StatusRow>
                <StatusRow label={text.consentValidUntilLabel}>{formatDay(status.consentValidUntil)}</StatusRow>
              </div>

              {startAuthorization.isError && (
                <BankFailureMessage message={text.startFailed} error={startAuthorization.error} />
              )}
              {disconnect.isError && <BankFailureMessage message={disconnectMessage} error={disconnect.error} />}
            </DashboardSection.Body>
          </DashboardSection>
        )}
      </PageBody>

      <RemoveConfirmDialog
        summary={isConfirmingDisconnect ? DISCONNECT_SUMMARY : null}
        titleIcon={<PlugsIcon weight="duotone" className={dialogHeaderIconClass} />}
        title={text.disconnectTitle}
        description={text.disconnectConfirm}
        confirmLabel={text.disconnect}
        pending={disconnect.isPending}
        error={null}
        onClose={() => setIsConfirmingDisconnect(false)}
        onConfirm={() => {
          disconnect.mutate(undefined, { onSettled: () => setIsConfirmingDisconnect(false) });
        }}
      />
    </PageLayout>
  );
}
