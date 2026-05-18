import { PLATFORM_CONFIG, type ServiceId } from "@musiccloud/shared";
import { useLayoutEffect, useMemo, useRef } from "react";
import { PlatformButton } from "@/components/platform/PlatformButton";
import type { PlatformLink } from "@/lib/types/platform";

interface AnimatedPlatformGridProps {
  platforms: PlatformLink[];
  songTitle: string;
}

const GRID_ANIMATION_MS = 620;
const GRID_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function AnimatedPlatformGrid({ platforms, songTitle }: AnimatedPlatformGridProps) {
  const itemRefs = useRef(new Map<ServiceId, HTMLDivElement>());
  const previousRects = useRef(new Map<ServiceId, DOMRect>());

  const visiblePlatforms = useMemo(
    () =>
      [...platforms]
        .filter((platform) => !PLATFORM_CONFIG[platform.platform]?.hidden)
        .sort((a, b) => PLATFORM_CONFIG[a.platform].label.localeCompare(PLATFORM_CONFIG[b.platform].label)),
    [platforms],
  );

  useLayoutEffect(() => {
    const nextRects = new Map<ServiceId, DOMRect>();

    for (const platform of visiblePlatforms) {
      const el = itemRefs.current.get(platform.platform);
      if (!el) continue;
      nextRects.set(platform.platform, el.getBoundingClientRect());
    }

    const frames: number[] = [];
    for (const platform of visiblePlatforms) {
      const el = itemRefs.current.get(platform.platform);
      const next = nextRects.get(platform.platform);
      if (!el || !next) continue;

      const previous = previousRects.current.get(platform.platform);
      Object.assign(el.style, {
        transition: "none",
        willChange: "transform, opacity",
      });

      if (previous) {
        const dx = previous.left - next.left;
        const dy = previous.top - next.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
      } else {
        el.style.transform = "translate3d(0, -10px, 0) scale3d(0.97, 0.97, 1)";
        el.style.opacity = "0";
      }

      const frame = requestAnimationFrame(() => {
        Object.assign(el.style, {
          opacity: "1",
          transform: "translate3d(0, 0, 0) scale3d(1, 1, 1)",
          transition: `transform ${GRID_ANIMATION_MS}ms ${GRID_EASE}, opacity ${GRID_ANIMATION_MS}ms ${GRID_EASE}`,
        });
      });
      frames.push(frame);
    }

    previousRects.current = nextRects;

    return () => {
      for (const frame of frames) cancelAnimationFrame(frame);
    };
  }, [visiblePlatforms]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {visiblePlatforms.map((platform) => (
        <div
          key={platform.platform}
          ref={(el) => {
            if (el) itemRefs.current.set(platform.platform, el);
            else itemRefs.current.delete(platform.platform);
          }}
          className="transform-gpu will-change-transform"
        >
          <PlatformButton
            platform={platform.platform}
            url={platform.url}
            songTitle={songTitle}
            displayName={platform.displayName}
            matchMethod={platform.matchMethod}
          />
        </div>
      ))}
    </div>
  );
}
