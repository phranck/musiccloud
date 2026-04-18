import { ENDPOINTS } from "@musiccloud/shared";
import { useEffect, useReducer, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useI18n } from "@/context/I18nContext";
import { AuthBackground } from "@/features/auth/AuthBackground";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import type { AdminInviteState, AdminUser } from "@/shared/types/admin";

const inputClassName =
  "w-full h-9 px-3 rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] text-sm text-[var(--ds-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]";

interface UiState {
  phase: "loading" | "loaded" | "error";
  data: AdminInviteState | null;
  error: string;
  submitting: boolean;
}

type Action =
  | { type: "loadSuccess"; data: AdminInviteState }
  | { type: "loadError"; error: string }
  | { type: "setError"; error: string }
  | { type: "submitStart" }
  | { type: "submitError"; error: string };

const initialState: UiState = { phase: "loading", data: null, error: "", submitting: false };

function reducer(state: UiState, action: Action): UiState {
  switch (action.type) {
    case "loadSuccess":
      return { phase: "loaded", data: action.data, error: "", submitting: false };
    case "loadError":
      return { phase: "error", data: null, error: action.error, submitting: false };
    case "setError":
      return { ...state, error: action.error };
    case "submitStart":
      return { ...state, error: "", submitting: true };
    case "submitError":
      return { ...state, error: action.error, submitting: false };
  }
}

export function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { messages } = useI18n();
  const common = messages.common;
  const inviteMessages = messages.auth.invite;

  const [ui, dispatch] = useReducer(reducer, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!token) {
        dispatch({ type: "loadError", error: inviteMessages.invalidLink });
        return;
      }

      try {
        const state = await api.get<AdminInviteState>(ENDPOINTS.admin.invite.state(token));
        if (!cancelled) dispatch({ type: "loadSuccess", data: state });
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: "loadError",
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
      dispatch({ type: "setError", error: inviteMessages.passwordMismatch });
      return;
    }

    dispatch({ type: "submitStart" });
    try {
      await api.post<AdminUser>(ENDPOINTS.admin.invite.accept, { token, password });
      await refresh();
      navigate("/");
    } catch (err) {
      dispatch({
        type: "submitError",
        error: err instanceof Error ? err.message : common.unknownError,
      });
    }
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="bg-[var(--ds-surface)] rounded-[var(--radius-card)] shadow-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
          <div className="bg-[var(--ds-surface-inset)] border-b border-[var(--ds-border-subtle)] px-5 py-4">
            <h2 className="font-bold text-[var(--ds-text)]">{inviteMessages.title}</h2>
          </div>

          <div className="px-5 py-4 flex flex-col gap-4">
            {ui.phase === "loading" ? (
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
                  <input
                    id="invite-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label
                    htmlFor="invite-password-confirm"
                    className="block text-sm font-medium text-[var(--ds-text)] mb-1.5"
                  >
                    {inviteMessages.confirmPassword}
                  </label>
                  <input
                    id="invite-password-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    className={inputClassName}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--ds-text-muted)]">{ui.error || inviteMessages.invalidLink}</p>
            )}

            {ui.error && ui.data && <p className="text-red-500 text-sm">{ui.error}</p>}
          </div>

          <div className="bg-[var(--ds-surface-inset)] border-t border-[var(--ds-border-subtle)] px-5 py-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="h-9 px-4 border border-[var(--ds-border)] text-[var(--ds-text-muted)] rounded-control text-sm hover:border-[var(--ds-border-strong)] transition-colors"
            >
              {inviteMessages.toLogin}
            </button>
            {ui.data && (
              <button
                type="button"
                disabled={ui.submitting || password.length < 8 || confirmPassword.length < 8}
                onClick={handleSubmit}
                className="h-9 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] transition-colors disabled:opacity-60"
              >
                {ui.submitting ? inviteMessages.submitLoading : inviteMessages.submit}
              </button>
            )}
          </div>
        </div>
      </div>
    </AuthBackground>
  );
}
