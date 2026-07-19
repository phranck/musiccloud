import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { Info as InfoIcon, Speedometer as SpeedometerIcon, SpinnerGap as SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { HeaderBackButton } from "@/components/ui/HeaderBackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import { ApiAccessRequestStatus } from "@/features/developer/domain";
import { useApiAccessOverview, useApproveRequest, useRejectRequest } from "@/features/developer/hooks/useDeveloperData";
import { formatDate } from "@/features/developer/lib";
import { Dialog } from "@/shared/ui/Dialog";

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const messages = dashboardCopy;
  const dm = messages.developer;
  const navigate = useNavigate();
  const { data, isLoading } = useApiAccessOverview();
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const [showReject, setShowReject] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reqPerMin, setReqPerMin] = useState(60);
  const [reqPerDay, setReqPerDay] = useState(1000);

  const request = data?.requests.find((r) => r.id === id) ?? null;
  const client = request ? (data?.clients.find((c) => c.requestId === request.id) ?? null) : null;

  // Sync rate-limit state from client when viewing an already-approved request
  if (client && reqPerMin === 60 && reqPerDay === 1000) {
    if (client.requestsPerMinute) setReqPerMin(client.requestsPerMinute);
    if (client.requestsPerDay) setReqPerDay(client.requestsPerDay);
  }

  function handleBack() {
    navigate("/developer/requests");
  }

  function handleApprove() {
    approve.mutate(
      { id: id!, requestsPerMinute: reqPerMin, requestsPerDay: reqPerDay },
      { onSuccess: () => navigate("/developer/requests") },
    );
  }

  function handleReject() {
    reject.mutate({ id: id!, reviewNote: reviewNote.trim() }, { onSuccess: () => navigate("/developer/requests") });
  }

  if (isLoading || !data) {
    return (
      <PageLayout>
        <PageHeader
          title=""
          renderLeading={() => <HeaderBackButton label={dm.detailBackLabel} onClick={handleBack} />}
        />
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </PageLayout>
    );
  }

  if (!request) {
    return (
      <PageLayout>
        <PageHeader
          title=""
          renderLeading={() => <HeaderBackButton label={dm.detailBackLabel} onClick={handleBack} />}
        />
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-[var(--ds-text-muted)]">Request not found.</p>
        </div>
      </PageLayout>
    );
  }

  const isPending = request.status === ApiAccessRequestStatus.Pending;

  return (
    <>
      <PageLayout>
        <PageHeader
          title={request.appName}
          renderLeading={() => <HeaderBackButton label={dm.detailBackLabel} onClick={handleBack} />}
        />
        <div className="space-y-4">
          <DashboardSection className="overflow-hidden">
            <DashboardSection.Header icon={<InfoIcon weight="duotone" className="size-4" />} title={request.appName} />
            <DashboardSection.Body>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className={labelClass}>{dm.colDeveloper}</div>
                  <div className="text-sm">{request.contactEmail}</div>
                </div>
                <div>
                  <div className={labelClass}>{dm.colSubmitted}</div>
                  <div className="text-sm text-[var(--ds-text-muted)]">{formatDate(request.submittedAt)}</div>
                </div>
                <div>
                  <div className={labelClass}>{dm.colTraffic}</div>
                  <div className="text-sm">
                    ~{request.estimatedRequestsPerDay}
                    {dm.perDay}
                  </div>
                </div>
                <div>
                  <div className={labelClass}>{dm.descriptionLabel}</div>
                  <p className="text-sm leading-relaxed">{request.appDescription}</p>
                </div>
              </div>
            </DashboardSection.Body>
          </DashboardSection>

          <DashboardSection className="overflow-hidden">
            <DashboardSection.Header
              icon={<SpeedometerIcon weight="duotone" className="size-4" />}
              title={dm.rateLimitsLabel}
            />
            <DashboardSection.Body>
              {isPending ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="req-per-min" className={labelClass}>
                      {dm.detailRateLimitMinute}
                    </label>
                    <DashboardInput
                      id="req-per-min"
                      type="number"
                      value={reqPerMin.toString()}
                      onChange={(e) => setReqPerMin(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label htmlFor="req-per-day" className={labelClass}>
                      {dm.detailRateLimitDay}
                    </label>
                    <DashboardInput
                      id="req-per-day"
                      type="number"
                      value={reqPerDay.toString()}
                      onChange={(e) => setReqPerDay(Number(e.target.value))}
                    />
                  </div>
                </div>
              ) : client ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className={labelClass}>{dm.detailRateLimitMinute}</div>
                    <div className="text-sm">{client.requestsPerMinute}</div>
                  </div>
                  <div>
                    <div className={labelClass}>{dm.detailRateLimitDay}</div>
                    <div className="text-sm">{client.requestsPerDay}</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className={labelClass}>{dm.detailRateLimitMinute}</div>
                    <div className="text-sm text-[var(--ds-text-muted)]">—</div>
                  </div>
                  <div>
                    <div className={labelClass}>{dm.detailRateLimitDay}</div>
                    <div className="text-sm text-[var(--ds-text-muted)]">—</div>
                  </div>
                </div>
              )}
            </DashboardSection.Body>
            {isPending && (
              <DashboardSection.Footer>
                <DashboardActionButton
                  action={DashboardActionId.Approve}
                  label={dm.detailApprove}
                  onClick={handleApprove}
                  disabled={approve.isPending}
                  type="button"
                />
                <DashboardActionButton
                  action={DashboardActionId.Reject}
                  label={dm.detailReject}
                  onClick={() => setShowReject(true)}
                  type="button"
                />
              </DashboardSection.Footer>
            )}
          </DashboardSection>
        </div>
      </PageLayout>

      <Dialog
        open={showReject}
        title={dm.detailReject}
        onClose={() => {
          setShowReject(false);
          setReviewNote("");
        }}
      >
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[var(--ds-text)]">{dm.detailRejectReasonLabel}</p>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder={dm.detailRejectReasonPlaceholder}
            rows={4}
            className="w-full bg-[var(--ds-bg)] border border-[var(--ds-border)] rounded px-3 py-2 text-sm resize-y"
            aria-label={dm.detailRejectReasonLabel}
          />
        </div>
        <Dialog.Footer>
          <DashboardActionButton
            action={DashboardActionId.Cancel}
            label={dm.detailRejectCancel}
            onClick={() => {
              setShowReject(false);
              setReviewNote("");
            }}
            type="button"
          />
          <DashboardActionButton
            action={DashboardActionId.Reject}
            label={dm.detailRejectConfirm}
            onClick={handleReject}
            disabled={!reviewNote.trim() || reject.isPending}
            type="button"
          />
        </Dialog.Footer>
      </Dialog>
    </>
  );
}
