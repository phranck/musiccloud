import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { ENDPOINTS } from "@musiccloud/shared";
import { useEffect, useReducer, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { dashboardCopy } from "@/copy/dashboard";
import { AuthBackground } from "@/features/auth/AuthBackground";
import { useAuth } from "@/features/auth/AuthContext";
import { AuthLogo } from "@/features/auth/AuthLogo";
import { api } from "@/lib/api";
import type { AdminInviteState, AdminUser } from "@/shared/types/admin";

interface UiState {
  phase: InvitePhase;
  data: AdminInviteState | null;
  error: string;
  submitting: boolean;
}

const InvitePhase = {
  Loading: "loading",
  Loaded: "loaded",
  Error: "error",
} as const;

type InvitePhase = (typeof InvitePhase)[keyof typeof InvitePhase];

const InviteActionType = {
  LoadSuccess: "loadSuccess",
  LoadError: "loadError",
  SetError: "setError",
  SubmitStart: "submitStart",
  SubmitError: "submitError",
} as const;

type Action =
  | { type: typeof InviteActionType.LoadSuccess; data: AdminInviteState }
  | { type: typeof InviteActionType.LoadError; error: string }
  | { type: typeof InviteActionType.SetError; error: string }
  | { type: typeof InviteActionType.SubmitStart }
  | { type: typeof InviteActionType.SubmitError; error: string };

const initialState: UiState = { phase: InvitePhase.Loading, data: null, error: "", submitting: false };

function reducer(state: UiState, action: Action): UiState {
  switch (action.type) {
    case InviteActionType.LoadSuccess:
      return { phase: InvitePhase.Loaded, data: action.data, error: "", submitting: false };
    case InviteActionType.LoadError:
      return { phase: InvitePhase.Error, data: null, error: action.error, submitting: false };
    case InviteActionType.SetError:
      return { ...state, error: action.error };
    case InviteActionType.SubmitStart:
      return { ...state, error: "", submitting: true };
    case InviteActionType.SubmitError:
      return { ...state, error: action.error, submitting: false };
  }
}

export function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const messages = dashboardCopy;
  const common = messages.common;
  const inviteMessages = messages.auth.invite;

  const [ui, dispatch] = useReducer(reducer, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!token) {
        dispatch({ type: InviteActionType.LoadError, error: inviteMessages.invalidLink });
        return;
      }

      try {
        const state = await api.get<AdminInviteState>(ENDPOINTS.admin.invite.state(token));
        if (!cancelled) dispatch({ type: InviteActionType.LoadSuccess, data: state });
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: InviteActionType.LoadError,
            error: err instanceof Error ? err.message : inviteMessages.invalidLink,
          });
        }
      }
    }

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [inviteMessages.invalidLink, token]);

  async function handleSubmit() {
    if (!token || password.length < 8) return;
    if (password !== confirmPassword) {
      dispatch({ type: InviteActionType.SetError, error: inviteMessages.passwordMismatch });
      return;
    }

    dispatch({ type: InviteActionType.SubmitStart });
    try {
      await api.post<AdminUser>(ENDPOINTS.admin.invite.accept, { token, password });
      await refresh();
      navigate("/");
    } catch (err) {
      dispatch({
        type: InviteActionType.SubmitError,
        error: err instanceof Error ? err.message : common.unknownError,
      });
    }
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <AuthLogo />
        </div>

        <div className="bg-[var(--ds-surface)] rounded-[var(--radius-card)] shadow-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
          <div className="bg-[var(--ds-surface-inset)] border-b border-[var(--ds-border-subtle)] px-5 py-4">
            <h2 className="font-bold text-[var(--ds-text)]">{inviteMessages.title}</h2>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            {ui.phase === InvitePhase.Loading ? (
              <p className="text-sm text-[var(--ds-text-muted)]">{common.loading}</p>
            ) : ui.data ? (
              <>
                <p className="text-sm text-[var(--ds-text-muted)]">{inviteMessages.subtitle}</p>

                <div className="rounded-[var(--radius-card)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] p-3">
                  <p className="font-medium text-[var(--ds-text)]">{ui.data.username}</p>
                  <p className="text-sm text-[var(--ds-text-muted)]">{ui.data.email}</p>
                </div>

                <div>
                  <label htmlFor="invite-password" className="block text-sm font-medium text-[var(--ds-text)] mb-1.5">
                    {inviteMessages.password}
                  </label>
                  <DashboardInput
                    id="invite-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                  />
                </div>

                <div>
                  <label
                    htmlFor="invite-password-confirm"
                    className="block text-sm font-medium text-[var(--ds-text)] mb-1.5"
                  >
                    {inviteMessages.confirmPassword}
                  </label>
                  <DashboardInput
                    id="invite-password-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--ds-text-muted)]">{ui.error || inviteMessages.invalidLink}</p>
            )}

            {ui.error && ui.data && <p className="text-red-500 text-sm">{ui.error}</p>}
          </div>

          <div className="bg-[var(--ds-surface-inset)] border-t border-[var(--ds-border-subtle)] px-5 py-4 flex justify-end gap-2">
            <DashboardActionButton
              action={DashboardActionId.Cancel}
              icon={false}
              label={inviteMessages.toLogin}
              onClick={() => navigate("/login")}
              size="control"
              type="button"
              variant={DashboardButtonVariant.Neutral}
            />
            {ui.data && (
              <DashboardActionButton
                action={DashboardActionId.Approve}
                busyLabel={inviteMessages.submitLoading}
                disabled={password.length < 8 || confirmPassword.length < 8}
                label={inviteMessages.submit}
                onClick={handleSubmit}
                size="control"
                status={ui.submitting ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
                type="button"
                variant={DashboardButtonVariant.Primary}
              />
            )}
          </div>
        </div>
      </div>
    </AuthBackground>
  );
}
