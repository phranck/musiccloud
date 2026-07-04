import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { useI18n } from "@/context/I18nContext";
import {
  useApiAccessRequest,
  useApproveRequest,
  useRejectRequest,
} from "@/features/developer/hooks/useDeveloperData";
import { ApiAccessRequestStatus } from "@/features/developer/domain";

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

  if (isLoading || !data) {
    return (
      <PageLayout>
        <PageHeader title="" />
        <div className="text-[var(--ds-text-muted)] text-sm">{messages.common.loading}</div>
      </PageLayout>
    );
  }

  const r = data.request;

  return (
    <PageLayout>
      <button
        type="button"
        onClick={() => navigate("/developer/requests")}
        className="text-sm text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] mb-4 transition-colors"
      >
        {dm.detailBackLabel}
      </button>
      <PageHeader title={r.appName} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-1">
            {dm.colDeveloper}
          </div>
          <div className="text-sm">{r.contactEmail}</div>
        </div>
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-1">
            {dm.colSubmitted}
          </div>
          <div className="text-sm">
            {new Date(r.submittedAt).toLocaleDateString("de-AT")}
          </div>
        </div>
      </div>

      <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4 mb-6">
        <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-2">
          Beschreibung
        </div>
        <p className="text-sm leading-relaxed">{r.appDescription}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4">
          <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-1">
            {dm.colTraffic}
          </div>
          <div className="text-sm font-semibold">~{r.estimatedRequestsPerDay} / Tag</div>
        </div>
      </div>

      {r.status === ApiAccessRequestStatus.Pending && (
        <>
          <div className="bg-[var(--ds-surface)] rounded-xl border border-[var(--ds-border-subtle)] p-4 mb-6">
            <div className="text-xs text-[var(--ds-text-muted)] uppercase tracking-wide mb-3">
              Rate Limits (optionaler Override)
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="req-per-min" className="block text-xs text-[var(--ds-text-muted)] mb-1">
                  {dm.detailRateLimitMinute}
                </label>
                <input
                  id="req-per-min"
                  type="number"
                  value={reqPerMin}
                  onChange={(e) => setReqPerMin(Number(e.target.value))}
                  className="w-full bg-[var(--ds-bg)] border border-[var(--ds-border)] rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="req-per-day" className="block text-xs text-[var(--ds-text-muted)] mb-1">
                  {dm.detailRateLimitDay}
                </label>
                <input
                  id="req-per-day"
                  type="number"
                  value={reqPerDay}
                  onChange={(e) => setReqPerDay(Number(e.target.value))}
                  className="w-full bg-[var(--ds-bg)] border border-[var(--ds-border)] rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {showReject ? (
            <div className="bg-[var(--ds-surface)] rounded-xl border border-red-500/30 p-4 mb-6">
              <div className="text-sm font-semibold text-red-400 mb-3">
                {dm.detailRejectReasonLabel}
              </div>
              <textarea
                id="review-note"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder={dm.detailRejectReasonPlaceholder}
                aria-label={dm.detailRejectReasonLabel}
                rows={4}
                className="w-full bg-[var(--ds-bg)] border border-[var(--ds-border)] rounded px-3 py-2 text-sm resize-y mb-3"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!reviewNote.trim() || reject.isPending}
                  onClick={() =>
                    reject.mutate(
                      { id: r.id, reviewNote: reviewNote.trim() },
                      { onSuccess: () => navigate("/developer/requests") },
                    )
                  }
                  className="px-4 py-2 rounded bg-red-600 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {dm.detailRejectConfirm}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReject(false);
                    setReviewNote("");
                  }}
                  className="px-4 py-2 rounded bg-[var(--ds-bg)] border border-[var(--ds-border)] text-sm"
                >
                  {dm.detailRejectCancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={approve.isPending}
                onClick={() =>
                  approve.mutate(
                    { id: r.id, requestsPerMinute: reqPerMin, requestsPerDay: reqPerDay },
                    { onSuccess: () => navigate("/developer/requests") },
                  )
                }
                className="flex-1 py-2.5 rounded bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40"
              >
                {dm.detailApprove}
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className="flex-1 py-2.5 rounded bg-red-600 text-white text-sm font-semibold"
              >
                {dm.detailReject}
              </button>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
}
