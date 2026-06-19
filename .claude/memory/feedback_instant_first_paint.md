---
name: Instant first paint prioritaet
description: User bevorzugt instant Shell-Render (Hintergrund + Logo) auch um Preis von dualen Render-Pfaden
type: feedback
originSessionId: 14e6da86-0e14-4371-84e5-6e91380e85d9
---
User erwartet, dass Share-Pages praktisch INSTANT statischen Shell-Content (Hintergrund, Sternenhimmel, LogoView) zeigen — Animationen und Daten duerfen nachkommen. Gefuehlte Wartezeit unakzeptabel.

**Why:** User-Frust ueber aktuelle Ladekette ("viel zu kompliziert"). Priorisiert UX vor Code-Einfachheit.

**How to apply:** Bei neuen Routes mit SSR-Daten-Abhaengigkeit: Shell sofort flushen (kein blocking `await` im Frontmatter), Daten via `server:defer` Server Island + `slot="fallback"` nachladen. Wenn OG/Crawler-Meta noetig, Bot-Split via UA (siehe `src/lib/isBot.ts` + `src/pages/[shortId].astro`).
