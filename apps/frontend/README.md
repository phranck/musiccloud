# @musiccloud/frontend

Astro 5 + React 19 + Tailwind 4 frontend for musiccloud.

## Scripts

- `npm run dev` — start dev server on `localhost:3000`
- `npm run build` — production build
- `npm run preview` — preview the built output
- `npm start` — run the built Node server

## Structure

- `src/pages/` — Astro routes (SSR on Node adapter)
- `src/components/` — React islands and Astro components
- `src/api/client.ts` — server-side API client (Astro calls backend here)
- `src/pages/api/` — Astro API routes that proxy to the backend
- `src/i18n/` — locale JSON + SSR translation helpers
- `src/styles/` — global CSS, animations, neumorphic tokens

## Environment

Reads from `.env.local` (and process env):

- `BACKEND_URL` — internal backend base URL (default `http://localhost:4000`)
- `INTERNAL_API_KEY` — shared secret for backend calls
- `TRACKING_ENABLED` — `true`/`false` (Umami analytics)
