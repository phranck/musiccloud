import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { ENDPOINTS } from "@musiccloud/shared";
import { useState } from "react";
import { useNavigate } from "react-router";

import { useI18n } from "@/context/I18nContext";
import { AuthBackground } from "@/features/auth/AuthBackground";
import { useAuth } from "@/features/auth/AuthContext";
import { AuthLogo } from "@/features/auth/AuthLogo";
import { api } from "@/lib/api";

export function SetupPage() {
  const { messages } = useI18n();
  const loginMessages = messages.auth.login;
  const setupMessages = messages.auth.setup;
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    if (fd.get("password") !== fd.get("passwordConfirm")) {
      setError(setupMessages.passwordMismatch);
      setLoading(false);
      return;
    }

    try {
      await api.post(ENDPOINTS.admin.auth.setup, {
        username: fd.get("username"),
        email: fd.get("email"),
        password: fd.get("password"),
      });
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : setupMessages.genericError);
    } finally {
      setLoading(false);
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
            <h2 className="font-bold text-[var(--ds-text)]">{setupMessages.title}</h2>
            <p className="text-sm text-[var(--ds-text-muted)] mt-1">{setupMessages.subtitle}</p>
          </div>

          <form id="setup-form" onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--ds-text)] mb-1.5">
                {loginMessages.username}
              </label>
              <DashboardInput id="username" name="username" type="text" required minLength={3} />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[var(--ds-text)] mb-1.5">
                {setupMessages.email}
              </label>
              <DashboardInput id="email" name="email" type="email" required />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--ds-text)] mb-1.5">
                {loginMessages.password}
              </label>
              <DashboardInput id="password" name="password" type="password" required minLength={8} />
            </div>

            <div>
              <label htmlFor="passwordConfirm" className="block text-sm font-medium text-[var(--ds-text)] mb-1.5">
                {setupMessages.confirmPassword}
              </label>
              <DashboardInput id="passwordConfirm" name="passwordConfirm" type="password" required />
            </div>

            {error && (
              <p role="alert" className="text-red-500 text-sm">
                {error}
              </p>
            )}
          </form>

          <div className="bg-[var(--ds-surface-inset)] border-t border-[var(--ds-border-subtle)] px-5 py-4 flex justify-end">
            <DashboardActionButton
              action={DashboardActionId.Create}
              busyLabel={setupMessages.submitLoading}
              disabled={loading}
              form="setup-form"
              label={setupMessages.submit}
              size="control"
              status={loading ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
              type="submit"
            />
          </div>
        </div>
      </div>
    </AuthBackground>
  );
}
