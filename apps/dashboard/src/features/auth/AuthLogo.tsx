import { LogoView } from "@/shared/ui/LogoView";

const WIDTH = 240;

export function AuthLogo() {
  return (
    <div className="relative mx-auto" style={{ width: WIDTH }}>
      <div
        className="absolute inset-0 rounded-full bg-[var(--color-primary)] animate-[auth-glow_8s_ease-in-out_infinite] pointer-events-none"
        aria-hidden="true"
      />
      <LogoView width={WIDTH} className="relative" />
    </div>
  );
}
