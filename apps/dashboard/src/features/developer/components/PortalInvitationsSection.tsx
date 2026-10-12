import {
  type ColumnDef,
  DashboardActionButton,
  DashboardActionId,
  DashboardButtonVariant,
  DashboardInput,
  DataTable,
} from "@musiccloud/dashboard-ui";
import { PORTAL_INVITATION_TTL_DAYS, type PortalInvitation, PortalInvitationState } from "@musiccloud/shared";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { type FormEvent, useMemo, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import {
  useInvitePortalDeveloper,
  usePortalInvitations,
  useResendPortalInvitation,
  useWithdrawPortalInvitation,
} from "@/features/developer/hooks/useDeveloperData";
import { formatEnglishDate } from "@/lib/format";
import { FormLabel } from "@/shared/ui/FormPrimitives";
import { describeRequestFailure } from "@/shared/utils/api-error";

const messages = dashboardCopy;
const dm = messages.developer;

/** The states an invitation can be sent again from: nobody followed its link and it is not withdrawn. */
const RESENDABLE_STATES: ReadonlySet<string> = new Set([PortalInvitationState.Open, PortalInvitationState.Expired]);

/** What a row's two buttons do, handed in by the section that owns the requests. */
interface InvitationRowActions {
  onResend: (invitation: PortalInvitation) => void;
  onWithdraw: (invitation: PortalInvitation) => void;
  /** Whether a send or a withdrawal is running, which holds every row's buttons. */
  busy: boolean;
}

/**
 * The columns of the invitation list. The account and the sending date give
 * way first on a narrow page, because the address, the state and the two
 * actions are what the owner acts on.
 *
 * @param actions - What the buttons do.
 * @returns The column definitions.
 */
function invitationColumns({ onResend, onWithdraw, busy }: InvitationRowActions): ColumnDef<PortalInvitation>[] {
  return [
    {
      id: "address",
      header: dm.invitationColAddress,
      cell: (invitation) => <span className="block truncate text-sm text-[var(--ds-text)]">{invitation.email}</span>,
    },
    {
      id: "state",
      header: dm.invitationColState,
      className: "w-28",
      cell: (invitation) => (
        <span className="text-sm text-[var(--ds-text)]">
          {dm.invitationStates[invitation.state] ?? invitation.state}
        </span>
      ),
    },
    {
      id: "account",
      header: dm.invitationColAccount,
      className: "w-56",
      secondary: true,
      cell: (invitation) =>
        invitation.account ? (
          <span className="block truncate text-sm text-[var(--ds-text)]">{invitation.account.email}</span>
        ) : (
          <span className="text-sm text-[var(--ds-text-muted)]">{dm.invitationAccountNone}</span>
        ),
    },
    {
      id: "sent",
      header: dm.invitationColSent,
      className: "w-44",
      secondary: true,
      cell: (invitation) => (
        <div className="min-w-0">
          <span className="block whitespace-nowrap text-sm text-[var(--ds-text-muted)]">
            {formatEnglishDate(invitation.sentAt, { dateStyle: "medium", timeStyle: "short" })}
          </span>
          {invitation.sentBy && (
            <span className="block truncate text-xs text-[var(--ds-text-muted)]">
              {dm.invitationSentBy.replace("{name}", invitation.sentBy)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: dm.invitationColActions,
      className: "w-72 text-right",
      cell: (invitation) => (
        <div className="flex justify-end gap-2">
          {RESENDABLE_STATES.has(invitation.state) && (
            <DashboardActionButton
              action={DashboardActionId.Send}
              label={dm.invitationResend}
              onClick={() => onResend(invitation)}
              disabled={busy}
              type="button"
            />
          )}
          {invitation.state !== PortalInvitationState.Withdrawn && (
            <DashboardActionButton
              action={DashboardActionId.Remove}
              label={dm.invitationWithdraw}
              onClick={() => onWithdraw(invitation)}
              disabled={busy}
              type="button"
              variant={DashboardButtonVariant.Neutral}
            />
          )}
        </div>
      ),
    },
  ];
}

/**
 * Who may use the portal while it is closed.
 *
 * The owner invites an address and sees every invitation with where it
 * stands, the account it ended on, and who sent it. An open or expired one
 * can be sent again with a new link, and any that is not withdrawn can be,
 * which takes back the access it gave. Withdrawing waits for a second press,
 * because it shuts somebody out.
 *
 * A failed request shows the server's message with its error id, so an
 * invitation that cannot be mailed says why rather than looking sent.
 *
 * @returns The invitations section.
 */
export function PortalInvitationsSection() {
  const invitationsQuery = usePortalInvitations();
  const invite = useInvitePortalDeveloper();
  const resend = useResendPortalInvitation();
  const withdraw = useWithdrawPortalInvitation();
  const [email, setEmail] = useState("");
  const [withdrawing, setWithdrawing] = useState<PortalInvitation | null>(null);

  const { mutate: resendInvitation } = resend;
  const busy = resend.isPending || withdraw.isPending;
  const columns = useMemo(
    () =>
      invitationColumns({
        onResend: (invitation) => resendInvitation(invitation.id),
        onWithdraw: setWithdrawing,
        busy,
      }),
    [resendInvitation, busy],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (address === "" || invite.isPending) return;
    invite.mutate(address, { onSuccess: () => setEmail("") });
  }

  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header
        icon={<EnvelopeSimpleIcon weight="duotone" className="size-4" />}
        title={dm.invitationsTitle}
      />
      <DashboardSection.Body>
        <p className="text-sm text-[var(--ds-text-muted)]">
          {dm.invitationsDescription.replace("{days}", String(PORTAL_INVITATION_TTL_DAYS))}
        </p>
        <form className="flex items-end gap-3" onSubmit={submit}>
          <div className="min-w-0 flex-1">
            <FormLabel htmlFor="portal-invitation-email">{dm.invitationEmailLabel}</FormLabel>
            <DashboardInput
              id="portal-invitation-email"
              type="email"
              autoComplete="off"
              placeholder={dm.invitationEmailPlaceholder}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <DashboardActionButton
            action={DashboardActionId.Send}
            label={invite.isPending ? dm.invitationSending : dm.invitationSend}
            disabled={email.trim() === "" || invite.isPending}
            type="submit"
            variant={DashboardButtonVariant.Primary}
          />
        </form>
        {invite.isError && <SaveErrorMessage error={invite.error} />}
        {invite.isSuccess && (
          <p role="status" className="text-sm text-[var(--ds-text-muted)]">
            {dm.invitationSent.replace("{email}", invite.data.invitation.email)}
          </p>
        )}
        {resend.isError && <SaveErrorMessage error={resend.error} />}
        {withdraw.isError && <SaveErrorMessage error={withdraw.error} />}
        {withdrawing && (
          <InlineConfirm
            message={dm.invitationWithdrawConfirm.replace("{email}", withdrawing.email)}
            confirmAction={DashboardActionId.Remove}
            confirmLabel={dm.invitationWithdraw}
            onConfirm={() => withdraw.mutate(withdrawing.id, { onSettled: () => setWithdrawing(null) })}
            onCancel={() => setWithdrawing(null)}
            disabled={withdraw.isPending}
          />
        )}
      </DashboardSection.Body>
      <DashboardSection.Body flush>
        {invitationsQuery.isPending && (
          <p className="px-4 py-3 text-sm text-[var(--ds-text-muted)]">{messages.common.loading}</p>
        )}
        {invitationsQuery.isError && (
          <p role="alert" className="px-4 py-3 text-sm text-[var(--ds-danger-text)]">
            {dm.invitationsUnavailable} {describeRequestFailure(invitationsQuery.error, messages.common.errorId)}
          </p>
        )}
        {invitationsQuery.data && (
          <DataTable
            columns={columns}
            data={invitationsQuery.data.invitations}
            getRowKey={(invitation) => invitation.id}
          >
            <DataTable.Empty>
              <p className="px-4 py-3 text-sm text-[var(--ds-text-muted)]">{dm.invitationsEmpty}</p>
            </DataTable.Empty>
            <DataTable.Viewport>
              <DataTable.Head />
              <DataTable.Rows />
            </DataTable.Viewport>
          </DataTable>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
