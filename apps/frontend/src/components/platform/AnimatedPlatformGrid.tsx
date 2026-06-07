import { PLATFORM_CONFIG, type ServiceId } from "@musiccloud/shared";
import { useLayoutEffect, useMemo, useRef } from "react";
import { PlatformButton } from "@/components/platform/PlatformButton";
import type { MediaCardContentType } from "@/lib/types/media-card";
import type { PlatformLink } from "@/lib/types/platform";

interface AnimatedPlatformGridProps {
  platforms: PlatformLink[];
  songTitle: string;
  contentType?: MediaCardContentType;
}

const GRID_ANIMATION_MS = 620;
const GRID_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export function AnimatedPlatformGrid({ platforms, songTitle, contentType }: AnimatedPlatformGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const itemRefMap = useMemo(() => new Map<ServiceId, HTMLDivElement>(), []);
  const previousRectMap = useMemo(() => new Map<ServiceId, DOMRect>(), []);
  const previousGridHeight = useRef<number | null>(null);
  const heightResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const el = itemRefMap.get(platform.platform);
      if (!el) continue;
      nextRects.set(platform.platform, el.getBoundingClientRect());
    }

    const grid = gridRef.current;
    const nextGridHeight = grid?.getBoundingClientRect().height ?? null;
    const previousHeight = previousGridHeight.current;
    if (grid && nextGridHeight !== null && previousHeight !== null && Math.abs(nextGridHeight - previousHeight) > 1) {
      if (heightResetTimer.current) clearTimeout(heightResetTimer.current);
      Object.assign(grid.style, {
        height: `${previousHeight}px`,
        overflow: "hidden",
        transition: "none",
      });
      void grid.offsetHeight;
      Object.assign(grid.style, {
        height: `${nextGridHeight}px`,
        transition: `height ${GRID_ANIMATION_MS}ms ${GRID_EASE}`,
      });
      heightResetTimer.current = setTimeout(() => {
        Object.assign(grid.style, { height: "auto", overflow: "", transition: "" });
      }, GRID_ANIMATION_MS + 80);
    }
    previousGridHeight.current = nextGridHeight;

    const frames: number[] = [];
    for (const platform of visiblePlatforms) {
      const el = itemRefMap.get(platform.platform);
      const next = nextRects.get(platform.platform);
      if (!el || !next) continue;

      const previous = previousRectMap.get(platform.platform);
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
        Object.assign(el.style, {
          transform: "translate3d(0, -10px, 0) scale3d(0.97, 0.97, 1)",
          opacity: "0",
        });
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

    previousRectMap.clear();
    for (const [service, rect] of nextRects) {
      previousRectMap.set(service, rect);
    }

    return () => {
      for (const frame of frames) cancelAnimationFrame(frame);
      if (heightResetTimer.current) clearTimeout(heightResetTimer.current);
    };
  }, [visiblePlatforms, itemRefMap, previousRectMap]);

  return (
    <div ref={gridRef} className="grid grid-cols-2 gap-0.5">
      {visiblePlatforms.map((platform) => (
        <div
          key={platform.platform}
          ref={(el) => {
            if (el) itemRefMap.set(platform.platform, el);
            else itemRefMap.delete(platform.platform);
          }}
          className="transform-gpu"
        >
          <PlatformButton
            platform={platform.platform}
            url={platform.url}
            songTitle={songTitle}
            displayName={platform.displayName}
            matchMethod={platform.matchMethod}
            contentType={contentType}
          />
        </div>
      ))}
    </div>
  );
}
