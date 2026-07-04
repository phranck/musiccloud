import { DashboardButtonVariant, DashboardInput } from "@musiccloud/dashboard-ui";
import {
  ChartBar as ChartBarIcon,
  CheckCircle as CheckCircleIcon,
  ClockCountdown as ClockCountdownIcon,
  Info as InfoIcon,
  SpinnerGap as SpinnerGapIcon,
  User as UserIcon,
  XCircle as XCircleIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { EditorPageShell } from "@/components/ui/EditorPageShell";
import { EditorToolbarButton } from "@/components/ui/EditorToolbarButton";
import { useI18n } from "@/context/I18nContext";
import { ApiAccessRequestStatus } from "@/features/developer/domain";
import { useApiAccessRequest, useApproveRequest, useRejectRequest } from "@/features/developer/hooks/useDeveloperData";
import { Dialog } from "@/shared/ui/Dialog";

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { messages } = useI18n();
  const dm = messages.developer;
  const navigate = useNavigate();
  const { data, isLoading } = useApiAccessRequest(id!);
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const [showReject, setShowReject] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [reqPerMin, setReqPerMin] = useState(60);
  const [reqPerDay, setReqPerDay] = useState(1000);

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
      <EditorPageShell title="" backLabel={dm.detailBackLabel} onBack={handleBack}>
        <div className="flex items-center justify-center py-12">
          <SpinnerGapIcon className="w-6 h-6 animate-spin text-[var(--ds-text-muted)]" />
        </div>
      </EditorPageShell>
    );
  }

  const r = data.request;
  const isPending = r.status === ApiAccessRequestStatus.Pending;

  const toolbar = isPending && (
    <div className="flex items-center gap-2 ml-auto">
      <EditorToolbarButton
        variant={DashboardButtonVariant.Primary}
        icon={<CheckCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
        onClick={handleApprove}
        disabled={approve.isPending}
      >
        {dm.detailApprove}
      </EditorToolbarButton>
      <EditorToolbarButton
        variant={DashboardButtonVariant.Neutral}
        icon={<XCircleIcon weight="duotone" className="w-3.5 h-3.5" />}
        onClick={() => setShowReject(true)}
      >
        {dm.detailReject}
      </EditorToolbarButton>
    </div>
  );

  return (
    <>
      <EditorPageShell
        title={r.appName}
        backLabel={dm.detailBackLabel}
        onBack={handleBack}
        toolbar={toolbar}
        cardClassName="!flex-initial w-[60%]"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DashboardSection>
              <DashboardSection.Header
                icon={<UserIcon weight="duotone" className="size-4" />}
                title={dm.colDeveloper}
              />
              <DashboardSection.Body>
                <div className="text-sm">{r.contactEmail}</div>
              </DashboardSection.Body>
            </DashboardSection>

            <DashboardSection>
              <DashboardSection.Header
                icon={<ClockCountdownIcon weight="duotone" className="size-4" />}
                title={dm.colSubmitted}
              />
              <DashboardSection.Body>
                <div className="text-sm text-[var(--ds-text-muted)]">
                  {new Date(r.submittedAt).toLocaleDateString("de-AT")}
                </div>
              </DashboardSection.Body>
            </DashboardSection>

            <DashboardSection>
              <DashboardSection.Header
                icon={<ChartBarIcon weight="duotone" className="size-4" />}
                title={dm.colTraffic}
              />
              <DashboardSection.Body>
                <div className="text-sm font-medium">~{r.estimatedRequestsPerDay} / Tag</div>
              </DashboardSection.Body>
            </DashboardSection>
          </div>

          <DashboardSection className="overflow-hidden">
            <DashboardSection.Header
              icon={<InfoIcon weight="duotone" className="size-4" />}
              title={dm.descriptionLabel}
            />
            <DashboardSection.Body>
              <p className="text-sm leading-relaxed">{r.appDescription}</p>
            </DashboardSection.Body>
          </DashboardSection>

          {isPending && (
            <DashboardSection className="overflow-hidden">
              <DashboardSection.Header
                icon={<ChartBarIcon weight="duotone" className="size-4" />}
                title={dm.rateLimitsLabel}
              />
              <DashboardSection.Body>
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
              </DashboardSection.Body>
            </DashboardSection>
          )}
        </div>
      </EditorPageShell>

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
          <EditorToolbarButton
            variant={DashboardButtonVariant.Neutral}
            icon={false}
            onClick={() => {
              setShowReject(false);
              setReviewNote("");
            }}
          >
            {dm.detailRejectCancel}
          </EditorToolbarButton>
          <EditorToolbarButton
            variant={DashboardButtonVariant.Primary}
            icon={false}
            onClick={handleReject}
            disabled={!reviewNote.trim() || reject.isPending}
          >
            {dm.detailRejectConfirm}
          </EditorToolbarButton>
        </Dialog.Footer>
      </Dialog>
    </>
  );
}
