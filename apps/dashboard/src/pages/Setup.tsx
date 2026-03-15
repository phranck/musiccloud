import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BrandName } from "@/components/ui/BrandName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocaleToggle } from "@/components/ui/locale-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { useT } from "@/i18n/context";

export function Setup() {
  const navigate = useNavigate();
  const t = useT();

  const { checking, setupRequired } = useSetupStatus();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!checking && setupRequired === false) {
      navigate("/login", { replace: true });
    }
  }, [checking, setupRequired, navigate]);

  if (checking || setupRequired === false) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? t("auth.connectionError"));
        return;
      }
      navigate("/login", { replace: true });
    } catch {
      setError(t("auth.connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <LocaleToggle />
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center space-y-1">
          <h1 className="text-4xl font-bold tracking-tight">
            <BrandName />
          </h1>
          <p className="text-muted-foreground text-sm">{t("auth.setupSubtitle")}</p>
        </div>

        {/* Card */}
        <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl shadow-xl p-8 space-y-6">
          <h2 className="text-lg font-semibold">{t("auth.setupTitle")}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("auth.username")}</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                minLength={3}
                maxLength={32}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="passwordConfirm">{t("auth.passwordConfirm")}</Label>
              <Input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.saving") : t("auth.setupButton")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
