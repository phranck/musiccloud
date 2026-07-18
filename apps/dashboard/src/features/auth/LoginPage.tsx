import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { dashboardCopy } from "@/copy/dashboard";
import { AuthBackground } from "@/features/auth/AuthBackground";
import { useAuth } from "@/features/auth/AuthContext";
import { AuthLogo } from "@/features/auth/AuthLogo";

function useAutofillSwap(ids: string[], setters: Record<string, (v: string) => void>) {
  const [inputKey, setInputKey] = useState(0);
  const [ignore, setIgnore] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const handled = useRef(false);

  useEffect(() => {
    function onAnimationStart(e: AnimationEvent) {
      if (e.animationName !== "on-autofill" || handled.current) return;
      const input = e.target as HTMLInputElement;
      if (!ids.includes(input.id)) return;

      handled.current = true;

      for (const id of ids) {
        const el = document.getElementById(id) as HTMLInputElement | null;
        if (el) setters[id]?.(el.value);
      }

      if (wrapRef.current) wrapRef.current.style.opacity = "0";
      setIgnore(true);
      setInputKey((k) => k + 1);
    }

    document.addEventListener("animationstart", onAnimationStart);
    return () => document.removeEventListener("animationstart", onAnimationStart);
  }, [ids, setters]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: inputKey triggers re-show after autofill swap
  useLayoutEffect(() => {
    if (wrapRef.current) wrapRef.current.style.opacity = "1";
  }, [inputKey]);

  return { inputKey, ignore, wrapRef };
}

const FIELD_IDS = ["username", "password"];

export function LoginPage() {
  const messages = dashboardCopy;
  const loginMessages = messages.auth.login;
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const setters = useRef<Record<string, (v: string) => void>>({
    username: setUsername,
    password: setPassword,
  }).current;

  const { inputKey, ignore, wrapRef } = useAutofillSwap(FIELD_IDS, setters);

  async function handleLogin() {
    if (!username || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch {
      setError(loginMessages.invalidCredentials);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <AuthBackground>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <AuthLogo />
        </div>

        <div
          ref={wrapRef}
          className="bg-[var(--ds-surface)] rounded-[var(--radius-card)] shadow-2xl border border-[rgba(255,255,255,0.06)] overflow-hidden"
        >
          <div className="bg-[var(--ds-surface-inset)] border-b border-[var(--ds-border-subtle)] px-5 py-4">
            <h2 className="font-bold text-[var(--ds-text)]">{loginMessages.title}</h2>
          </div>

          <div key={inputKey} className="px-5 py-4 flex flex-col gap-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--ds-text)] mb-1.5">
                {loginMessages.username}
              </label>
              <DashboardInput
                id="username"
                type="text"
                autoComplete="off"
                data-1p-ignore={ignore || undefined}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--ds-text)] mb-1.5">
                {loginMessages.password}
              </label>
              <DashboardInput
                id="password"
                type="password"
                autoComplete="off"
                data-1p-ignore={ignore || undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            {error && (
              <p role="alert" className="text-red-500 text-sm">
                {error}
              </p>
            )}
          </div>

          <div className="bg-[var(--ds-surface-inset)] border-t border-[var(--ds-border-subtle)] px-5 py-4 flex justify-end">
            <DashboardActionButton
              action={DashboardActionId.Approve}
              busyLabel={loginMessages.submitLoading}
              disabled={!username || !password}
              label={loginMessages.submit}
              onClick={handleLogin}
              size="control"
              status={loading ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
              type="button"
              variant={DashboardButtonVariant.Primary}
            />
          </div>
        </div>
      </div>
    </AuthBackground>
  );
}
