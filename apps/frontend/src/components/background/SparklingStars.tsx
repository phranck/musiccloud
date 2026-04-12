import { useMemo } from "react";

/**
 * Ambient particle effect: small glowing dots that briefly flash in,
 * then fade out while drifting toward the page center.
 *
 * Pure CSS animation -- all particles are rendered once at mount with
 * randomized positions, delays, and durations. No JS after mount,
 * no DOM manipulation, fully GPU-accelerated.
 *
 * Hidden on touch devices and when prefers-reduced-motion is set (via CSS).
 */

interface Particle {
  id: string;
  x: number;
  y: number;
  size: number;
  glowSize: number;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  drift: boolean;
  bright: boolean;
}

const PARTICLE_COUNT = 24;

function generateParticles(): Particle[] {
  const particles: Particle[] = [];
  const totalCycleDuration = 8;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const centerX = 50;
    const centerY = 45;

    const dx = centerX - x;
    const dy = centerY - y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const isLongRange = Math.random() > 0.6;
    const driftLength = isLongRange ? 8 + Math.random() * 10 : 3 + Math.random() * 5;
    const driftX = (dx / dist) * driftLength;
    const driftY = (dy / dist) * driftLength;

    const size = 2 + Math.random() * 2;
    const glowSize = size * 5 + Math.random() * 8;
    const duration = isLongRange ? 3.5 + Math.random() * 3 : 2.5 + Math.random() * 2;
    const delay = (i / PARTICLE_COUNT) * totalCycleDuration + Math.random() * 1.5;
    const drift = Math.random() > 0.15;
    const bright = Math.random() > 0.7;

    particles.push({ id: `sp-${i}`, x, y, size, glowSize, duration, delay, driftX, driftY, drift, bright });
  }
  return particles;
}

export function SparklingStars() {
  const particles = useMemo(generateParticles, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 hidden sm:block"
      aria-hidden="true"
      style={{ ["--sparkle-display" as string]: "block" }}
    >
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: "var(--color-accent)",
            filter: `blur(${p.size * 0.4}px)`,
            boxShadow: [
              `0 0 ${p.glowSize * (p.bright ? 1.5 : 1)}px var(--color-accent-glow)`,
              `0 0 ${p.glowSize * (p.bright ? 3.5 : 2.5)}px var(--color-accent-glow)`,
              `0 0 ${p.glowSize * 4}px rgba(44, 185, 200, ${p.bright ? 0.15 : 0.08})`,
            ].join(", "),
            opacity: 0,
            animation: `${p.drift ? "sparkle-drift" : "sparkle-fade"} ${p.duration}s ease-in ${p.delay}s infinite`,
            ["--drift-x" as string]: `${p.driftX}vw`,
            ["--drift-y" as string]: `${p.driftY}vh`,
          }}
        />
      ))}
    </div>
  );
}
