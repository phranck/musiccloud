import { DashboardButton, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { BANK_CONNECTION_DASHBOARD_PATH } from "@musiccloud/shared";
import { BankIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { type NavigateOptions, useNavigate, useSearchParams } from "react-router";

import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import { BankFailureMessage } from "@/features/sponsoring/BankFailureMessage";
import { useCompleteBankAuthorization } from "@/features/sponsoring/useBankConnection";

/** The bank connection's copy. */
const text = dashboardCopy.sponsoring.bankConnection;

/** The query parameter the bank's code arrives in. */
const CODE_PARAMETER = "code";

/** The query parameter the state this site sent out comes back in. */
const STATE_PARAMETER = "state";

/** Navigation that replaces the callback's entry, so going back never lands on a spent return. */
const REPLACE_ENTRY: NavigateOptions = { replace: true };

/**
 * Where the bank returns the account holder after they have identified
 * themselves, ported from lmaa.space's bank connection callback page.
 *
 * The address registered with Enable Banking is this one, so the return lands
 * on a page that is already signed in. What arrives in the address bar is
 * handed to the backend, which is the only place holding the key that can
 * spend it, and then removed from the address so a reload cannot present it
 * again. On success the page goes on to the bank connection page. A return
 * that is incomplete is not sent at all, and a refused one says so with the
 * backend's code and error id.
 *
 * @returns The page.
 */
export function BankConnectionCallbackPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { mutateAsync } = useCompleteBankAuthorization();

  // The outcome is kept here rather than read from the mutation's own state.
  // Strict mode detaches the mutation's observer between its two effect runs,
  // and the guard below lets only the first run send, so the observer never
  // hears how the request ended. The promise does, whichever run is current.
  const [refusal, setRefusal] = useState<unknown>(null);

  // Read once, on the first render. Everything below then works from this copy,
  // including after the address has been cleared.
  const [handover] = useState(() => ({
    code: searchParams.get(CODE_PARAMETER) ?? "",
    state: searchParams.get(STATE_PARAMETER) ?? "",
  }));

  // The return is spendable exactly once, so the request is made exactly once.
  // Without this the development double effect would spend it and then report
  // the second attempt as a failure.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    setSearchParams({}, REPLACE_ENTRY);
    if (!handover.code || !handover.state) return;

    mutateAsync(handover).then(
      () => void navigate(BANK_CONNECTION_DASHBOARD_PATH, REPLACE_ENTRY),
      (error: unknown) => setRefusal(error ?? new Error(text.callbackFailedHint)),
    );
  }, [handover, mutateAsync, navigate, setSearchParams]);

  const refused = refusal !== null;
  const failed = refused || !handover.code || !handover.state;

  return (
    <PageLayout>
      <PageHeader title={text.title} />
      <PageBody>
        {failed ? (
          <div className="flex flex-col items-center gap-4">
            <ContentUnavailableView
              icon={<BankIcon weight="duotone" aria-hidden />}
              title={text.callbackFailedTitle}
              subtitle={refused ? undefined : text.callbackFailedHint}
            />
            {refused && <BankFailureMessage message={text.callbackFailedHint} error={refusal} />}
            <DashboardButton
              variant={DashboardButtonVariant.Primary}
              onClick={() => void navigate(BANK_CONNECTION_DASHBOARD_PATH, REPLACE_ENTRY)}
            >
              {text.callbackBack}
            </DashboardButton>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--ds-text-muted)]">
            {text.callbackPending}
          </div>
        )}
      </PageBody>
    </PageLayout>
  );
}
