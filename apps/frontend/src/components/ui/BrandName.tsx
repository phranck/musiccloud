/**
 * Brand name "musiccloud" with a single rainbow gradient and music note icon.
 *
 * Matches the LogoText view from the Apple app:
 * "musicc" + music.note icon + "oud"
 *
 * Technique: render the content as a child of a span that has a gradient
 * background. The text uses background-clip:text. The SVG note uses
 * the same gradient via an inline SVG <linearGradient> with
 * gradientUnits="userSpaceOnUse" spanning the full container width.
 * To make this work, we measure the container width and pass it to the SVG.
 */

import { useEffect, useRef, useState } from "react";

const colors = [
  [0, "#FF6699"],
  [14, "#9966FF"],
  [28, "#4D99FF"],
  [42, "#00CCE6"],
  [57, "#00E6B3"],
  [71, "#80E64D"],
  [85, "#E6E64D"],
  [100, "#FFB34D"],
] as const;

const cssGradient = `linear-gradient(to right, ${colors.map(([p, c]) => `${c} ${p}%`).join(", ")})`;

const musicNotePath =
  "M15.0098 6.2207L15.0098 1.5625C15.0098 0.9375 14.5117 0.527344 13.8965 0.654297L7.58789 2.03125C6.8457 2.1875 6.44531 2.59766 6.44531 3.25195L6.47461 17.1387C6.5332 17.793 6.21094 18.2324 5.63477 18.3496L3.63281 18.7695C1.16211 19.2773 0 20.5176 0 22.3926C0 24.2676 1.43555 25.5762 3.48633 25.5762C5.3125 25.5762 8.00781 24.248 8.00781 20.6445L8.00781 9.23828C8.00781 8.53516 8.1543 8.36914 8.79883 8.22266L14.375 7.00195C14.7656 6.91406 15.0098 6.62109 15.0098 6.2207Z";

function MusicNote({ containerRef }: { containerRef: React.RefObject<HTMLSpanElement | null> }) {
  const noteRef = useRef<SVGSVGElement>(null);
  const [gradCoords, setGradCoords] = useState({ x1: 0, x2: 100 });

  useEffect(() => {
    const container = containerRef.current;
    const note = noteRef.current;
    if (!container || !note) return;

    const update = () => {
      const cRect = container.getBoundingClientRect();
      const nRect = note.getBoundingClientRect();
      // Map container's full gradient range into the note's local coordinate space
      const noteViewBoxWidth = 15.3711;
      const scale = noteViewBoxWidth / nRect.width;
      const offsetX = (nRect.left - cRect.left) * scale;
      const totalWidth = cRect.width * scale;
      setGradCoords({ x1: -offsetX, x2: totalWidth - offsetX });
    };

    let rafId: number;
    const throttledUpdate = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    document.fonts.ready.then(update);
    window.addEventListener("resize", throttledUpdate);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", throttledUpdate);
    };
  }, [containerRef]);

  return (
    <svg
      ref={noteRef}
      viewBox="0 0 15.3711 25.5762"
      aria-hidden="true"
      style={{
        height: "0.85em",
        width: "auto",
        display: "inline-block",
        verticalAlign: "baseline",
        marginLeft: "0.06em",
        marginRight: "-0.1em",
        marginBottom: "-0.1em",
      }}
    >
      <defs>
        <linearGradient
          id="brand-note-grad"
          gradientUnits="userSpaceOnUse"
          x1={gradCoords.x1}
          x2={gradCoords.x2}
          y1="0"
          y2="0"
        >
          {colors.map(([p, c]) => (
            <stop key={p} offset={`${p}%`} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <path d={musicNotePath} fill="url(#brand-note-grad)" />
    </svg>
  );
}

export function BrandName() {
  const ref = useRef<HTMLSpanElement>(null);

  return (
    <span
      ref={ref}
      style={{
        fontFamily: '"Nasalization", sans-serif',
        display: "inline-flex",
        alignItems: "baseline",
        background: cssGradient,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      musicc
      <MusicNote containerRef={ref} />
      oud
    </span>
  );
}
