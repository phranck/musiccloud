import { type ActiveService, ENDPOINTS, type ServiceId } from "@musiccloud/shared";
import { useEffect, useRef, useState } from "react";
import { PlatformIcon } from "@/components/platform/PlatformIcon";

function MarqueeStrip({ services, label }: { services: ActiveService[]; label?: boolean }) {
  return (
    <div className="flex items-center gap-8 sm:gap-16 shrink-0 pr-8 sm:pr-16" {...(!label && { "aria-hidden": true })}>
      {services.map((service) => (
        <div
          key={service.id}
          className="group relative opacity-30 hover:opacity-60 transition-opacity duration-200 flex-shrink-0"
          {...(label && {
            "aria-label": service.displayName,
            role: "img" as const,
          })}
        >
          <PlatformIcon platform={service.id as ServiceId} className="w-8 h-8 saturate-0 brightness-200" />
          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 text-[11px] text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            {service.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PlatformIconRow() {
  const stripRef = useRef<HTMLDivElement>(null);
  const [services, setServices] = useState<ActiveService[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    (async () => {
      let result: ActiveService[] = [];
      try {
        const res = await fetch(ENDPOINTS.frontend.activeServices, { signal: controller.signal });
        if (res.ok) result = (await res.json()) as ActiveService[];
        else if (import.meta.env.DEV) console.warn("[PlatformIconRow] active-services fetch failed:", res.status);
      } catch (err) {
        if (import.meta.env.DEV && !(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("[PlatformIconRow] active-services fetch error:", err);
        }
      } finally {
        clearTimeout(timeout);
      }
      if (!cancelled) setServices(result);
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  const handleMouseEnter = () => {
    const anim = stripRef.current?.getAnimations()[0];
    if (anim) anim.playbackRate = 0.1;
  };

  const handleMouseLeave = () => {
    const anim = stripRef.current?.getAnimations()[0];
    if (anim) anim.playbackRate = 1;
  };

  // Don't render the marquee strip until we have data, and hide it when
  // the operator has toggled every plugin off (empty list).
  if (!services || services.length === 0) return null;

  return (
    <div className="hidden sm:flex fixed bottom-12 left-0 right-0 justify-center">
      <div
        className="w-[90%] pb-6"
        role="presentation"
        aria-hidden="true"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          overflow: "hidden",
        }}
      >
        <div ref={stripRef} className="flex w-max will-change-transform animate-marquee-seamless">
          <MarqueeStrip services={services} label />
          <MarqueeStrip services={services} />
          <MarqueeStrip services={services} />
          <MarqueeStrip services={services} />
        </div>
      </div>
    </div>
  );
}
