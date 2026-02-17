import { useEffect, useRef } from "react";

/**
 * Ambient particle effect: small glowing dots that briefly flash in,
 * then fade out while drifting a short distance toward the page center.
 * Pure DOM + CSS animations, no canvas.
 */
export function SparklingStars() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    let active = true;
    const particles: HTMLDivElement[] = [];

    function spawn() {
      if (!active || !container) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Virtual center: roughly where the input field sits (center-x, ~45% from top)
      const centerX = vw / 2;
      const centerY = vh * 0.45;

      // Random position anywhere on the page
      const startX = Math.random() * vw;
      const startY = Math.random() * vh;

      // Drift toward center (40-90px)
      const dx = centerX - startX;
      const dy = centerY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      // Mix of short and long travelers
      const isLongRange = Math.random() > 0.6;
      const driftLength = isLongRange ? 160 + Math.random() * 200 : 60 + Math.random() * 80;
      const driftX = (dx / dist) * driftLength;
      const driftY = (dy / dist) * driftLength;

      const size = 2 + Math.random() * 2;
      const glowSize = size * 5 + Math.random() * 8;
      const duration = isLongRange ? 3.5 + Math.random() * 3 : 2.5 + Math.random() * 2;
      const shouldDrift = Math.random() > 0.15;
      const isBright = Math.random() > 0.7;

      const el = document.createElement("div");
      el.className = "sparkling-star";
      el.style.cssText = `
        position: fixed;
        left: ${startX}px;
        top: ${startY}px;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: var(--color-accent);
        filter: blur(${size * 0.4}px);
        box-shadow: 0 0 ${glowSize * (isBright ? 1.5 : 1)}px var(--color-accent-glow), 0 0 ${glowSize * (isBright ? 3.5 : 2.5)}px var(--color-accent-glow), 0 0 ${glowSize * 4}px rgba(44, 185, 200, ${isBright ? 0.15 : 0.08});
        pointer-events: none;
        opacity: ${isBright ? 1 : 0.7};
        animation: ${shouldDrift ? "sparkle-drift" : "sparkle-fade"} ${duration}s ease-in forwards;
        --drift-x: ${driftX}px;
        --drift-y: ${driftY}px;
      `;

      container.appendChild(el);
      particles.push(el);

      // Remove after animation
      setTimeout(
        () => {
          el.remove();
          const idx = particles.indexOf(el);
          if (idx !== -1) particles.splice(idx, 1);
        },
        duration * 1000 + 50,
      );
    }

    // Spawn at random intervals (250-700ms apart)
    let timeout: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      if (!active) return;
      const delay = 250 + Math.random() * 450;
      timeout = setTimeout(() => {
        spawn();
        scheduleNext();
      }, delay);
    }

    scheduleNext();

    // Pause when motion preference changes
    const handleMotionChange = () => {
      if (motionQuery.matches) {
        active = false;
        clearTimeout(timeout);
        particles.forEach((p) => p.remove());
        particles.length = 0;
      }
    };
    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      active = false;
      clearTimeout(timeout);
      motionQuery.removeEventListener("change", handleMotionChange);
      particles.forEach((p) => p.remove());
    };
  }, []);

  return <div ref={containerRef} className="fixed inset-0 pointer-events-none z-0" aria-hidden="true" />;
}
