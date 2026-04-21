<p align="center">
  <a href="https://astro.build"><img alt="Astro" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/astro?filename=apps%2Ffrontend%2Fpackage.json&label=astro&color=ff4a8d&style=flat"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/phranck/musiccloud?label=license&color=a855f7&style=flat"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/dev/typescript?label=typescript&color=3b82f6&style=flat"></a>
  <a href="https://react.dev"><img alt="React" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/react?filename=apps%2Ffrontend%2Fpackage.json&label=react&color=06b6d4&style=flat"></a>
  <a href="https://fastify.dev"><img alt="Fastify" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/fastify?filename=apps%2Fbackend%2Fpackage.json&label=fastify&color=10b981&style=flat"></a>
  <a href="https://github.com/phranck/musiccloud/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/phranck/musiccloud/ci.yml?branch=main&label=CI&color=eab308&style=flat"></a>
  <a href="https://biomejs.dev"><img alt="Biome" src="https://img.shields.io/github/package-json/dependency-version/phranck/musiccloud/dev/@biomejs/biome?label=biome&color=f97316&style=flat"></a>
</p>

<img width="1024" height="256" alt="email-header" src="https://github.com/user-attachments/assets/557486dc-5934-431f-bf22-6db8d1d369a5" />

# musiccloud.io

Paste a music link from one streaming service, get a universal share URL that opens the same track or album on every other service the listener has.

Live at [https://musiccloud.io](https://musiccloud.io).

## What it does

- **URL resolution.** Paste a Spotify, Apple Music, YouTube, Tidal, Deezer, SoundCloud, Qobuz, Bandcamp, Beatport, Audius, Pandora, JioSaavn, Boomplay, Audiomack, Netease, QQ Music, Melon, Bugs, KKBOX, or Napster link and the backend resolves the track or album across all supported services, preferring ISRC/UPC matches and falling back to scored text search with confidence filtering.
- **Text search.** Type a song title or artist and get cross-service candidates with disambiguation when the top match is not confident enough.
- **Genre discovery.** Browse by Last.fm tags, resolve any tag to a representative cross-service set of tracks.
- **Share pages.** Every resolved result gets a short URL with server-side-rendered OpenGraph/Twitter meta for rich link previews.
- **Admin dashboard.** Analytics (via Umami), track/album management, user administration, content pages, media library.
- **Public API with Swagger UI** for third-party integration.

## Supported streaming services

Deezer, Audius, SoundCloud, Pandora, Qobuz, Boomplay, Bandcamp, Audiomack, Netease, QQ Music, Melon, Bugs, JioSaavn, Beatport, Spotify, Apple Music, YouTube, Tidal, KKBOX, Napster.

Each service is implemented as a plugin under `apps/backend/src/services/plugins/*`. Adding a new one means implementing a `ServiceAdapter` and registering it in the plugin manifest.

## Tech stack

- **Monorepo** via npm workspaces.
- **Backend:** Fastify 5 + TypeScript + Drizzle ORM + PostgreSQL 16. Compiled with tsup. Swagger/OpenAPI via `@fastify/swagger`.
- **Frontend:** Astro 5 (SSR, Node adapter) + React 19 islands + Tailwind 4.
- **Dashboard:** React 19 + Vite + UnoCSS + TanStack Query.
- **Shared package** (`packages/shared`): API types, endpoint paths, error codes.
- **Tooling:** Biome 2.4 (lint + format), Vitest (675 tests across 33 files), drizzle-kit migrations.

## Repository layout

```
apps/
  Apple/            Swift native app (macOS/iOS/iPadOS) + Share Extension
  backend/          Fastify API (resolve, share, admin, analytics, swagger)
  dashboard/        Admin React SPA (analytics, users, media, content)
  frontend/         Astro SSR site (landing, search, share pages)
packages/
  shared/           TypeScript types + API contracts shared across apps
drizzle.config.postgres.ts
zerops.yml          Hosting config
```

## Getting started

### Prerequisites

- Node.js >= 20
- npm >= 10
- PostgreSQL 16 (the project uses Drizzle migrations; local dev typically runs PG in Docker on port `5433`)

### Secret scanning (pre-commit hook)

The repo ships a `gitleaks` pre-commit hook under `.githooks/` that blocks commits containing secrets. After cloning, enable it once per clone:

```bash
brew install gitleaks            # or: https://github.com/gitleaks/gitleaks
git config core.hooksPath .githooks
```

If `gitleaks` is not installed, the hook skips the scan with a warning instead of blocking the commit.

## License

[MIT](LICENSE).
