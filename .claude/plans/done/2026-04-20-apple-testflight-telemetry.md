# Plan: Apple App Testflight Telemetry & Diagnostics Export

Plan-Nr.: MC-004

> NOTE: this file overwrites a previous, unrelated plan (local dev-server
> launcher). That work is already shipped on `main`.

## Context

The macOS/iOS client (`apps/Apple`) has no structured diagnostics pipeline. When a URL fails to resolve the user sees a generic red error card, and we have no way to correlate that with the backend resolver state. `OSLog` is already in use via `AppLogger` (subsystem `io.musiccloud.app`, categories `UI | API | ClipboardMonitor | History`) but nothing is persisted, exported, or shipped anywhere.

Goal: in Testflight builds only, produce structured error events that
1. automatically stream to the backend (so I have them without user action), and
2. can also be exported manually by a tester via a share sheet (when network is offline, or when I ask someone to "send me the log").

App Store builds stay untouched — no network beacons, no extra UI.

The backend ingest endpoint does double duty: it is the first public `POST` that benefits from `@fastify/rate-limit`, so we install + register the plugin now, which also clears 10 open CodeQL `js/missing-rate-limiting` alerts on the admin routes as a side effect.

## Approach

### Testflight detection (one helper, reused everywhere)

Add `BuildChannel.swift` under `apps/Apple/App/Shared/Utils/`:

```swift
enum BuildChannel { case debug, testflight, appStore
    static let current: BuildChannel = {
        #if DEBUG
        return .debug
        #else
        let receipt = Bundle.main.appStoreReceiptURL?.lastPathComponent
        return receipt == "sandboxReceipt" ? .testflight : .appStore
        #endif
    }()
    static var diagnosticsEnabled: Bool { current != .appStore }
}
```

### Swift side

New folder `apps/Apple/App/Shared/Diagnostics/`:

- `TelemetryEvent.swift` — `Codable` struct matching the backend schema (see below). Static factories `resolveError(...)`, `networkError(...)`.
- `TelemetryClient.swift` — actor. `report(_ event:)` → POST to `<base>/api/v1/telemetry/app-error`; on failure append to a JSONL file in the app group container; on next launch / next success, drain the file. No-op when `BuildChannel.diagnosticsEnabled == false`.
- `InstallID.swift` — random UUID generated once, stored in Keychain (shared access group with ShareExtension), used as stable non-PII correlation id.
- `DiagnosticsExporter.swift` — reads `OSLogStore.local(scope:.currentProcessIdentifier)` for the `io.musiccloud.app` subsystem over the last N hours, formats as JSONL, writes to a temp `.log` file, returns the URL.

Wire-up points (no UI invention — reuse existing surfaces):

- `apps/Apple/App/Shared/API/MusicCloudAPI.swift:109–143` (`resolve(url:)`) — on `throw`, call `TelemetryClient.shared.report(.resolveError(...))` before rethrowing.
- `apps/Apple/App/Shared/API/Error Handling/MusicCloudAPI.swift:222–237` (`mapError`) — the structured `ResolveError` case is the natural payload source.
- `apps/Apple/ShareExtension/ShareViewController.swift:154–185` — same hook inside the existing `catch` before `showError(...)`. Share-target needs the Keychain access group for `InstallID`.

Export UI (Testflight-gated, `if BuildChannel.diagnosticsEnabled`):

- iOS: `apps/Apple/App/iOS/Views/Settings/iOSSettingsView.swift` — new "Diagnostics" section, one row "Logs exportieren" → `ShareLink(item: DiagnosticsExporter.exportURL())`.
- macOS: `apps/Apple/App/macOS/Views/Dashboard/AboutView.swift` (currently "Coming soon") — replace placeholder with a "Diagnostics" panel and an `NSSharingServicePicker`-backed button.

### Backend side

Files to add / modify:

- `apps/backend/package.json` — add `@fastify/rate-limit`.
- `apps/backend/src/server.ts` — `await app.register(rateLimit, { max: 300, timeWindow: "1 minute", allowList: [...admin auth tokens via hook] })`. Global default solves the 10 open CodeQL rate-limit alerts in one shot; the telemetry route overrides with a stricter `{ max: 60, timeWindow: "1 minute" }`.
- `packages/shared/src/endpoints.ts` — add `telemetry: { appError: "/api/v1/telemetry/app-error" }` under `ENDPOINTS.v1`.
- `apps/backend/src/routes/telemetry-app-error.ts` (NEW) — Fastify route. Public, `POST`, JSON body validated against the schema below, `CORS` already handled by `@fastify/cors`. Response is `204 No Content`. Follows the `auth.ts` schema pattern (`tags: ["Telemetry"]`, `summary`, `body`, `response`).
- `apps/backend/src/services/telemetry-app.ts` (NEW) — service layer, calls repo, trims message to 2 KB, drops request if body larger than 8 KB.
- `apps/backend/src/db/schemas/postgres.ts` — `appTelemetryEvents` table: `id uuid pk default gen_random_uuid()`, `received_at timestamptz default now()`, `event_type text`, `event_time timestamptz`, `install_id text`, `app_version text`, `build_number text`, `platform text`, `os_version text`, `device_model text`, `locale text`, `source_url text`, `service text`, `error_kind text`, `http_status int`, `message text`. Indexes on `(received_at desc)` and `(install_id, received_at desc)`.
- `apps/backend/src/db/migrations/postgres/0016_app_telemetry_events.sql` — CREATE TABLE + indexes.
- `apps/backend/src/db/adapters/postgres.ts` — `insertAppTelemetryEvent(row)` near the other insert helpers.

### Payload schema (shared contract)

```ts
{
  eventType: "resolve_error" | "network_error" | "decode_error" | "unknown_error",
  eventTime: string,           // ISO-8601, client clock
  installId: string,           // UUIDv4 from Keychain
  appVersion: string,          // CFBundleShortVersionString
  buildNumber: string,         // CFBundleVersion
  platform: "ios" | "macos",
  osVersion: string,           // ProcessInfo.operatingSystemVersionString
  deviceModel: string,         // "iPhone15,2", "Mac14,7"
  locale: string,              // "de-DE"
  sourceUrl: string | null,    // the URL the user tried to resolve
  service: string | null,      // "spotify" | "bandcamp" | ...
  errorKind: string,           // "RESOLVE_FAILED" | "NETWORK_TIMEOUT" | ...
  httpStatus: number | null,
  message: string              // ≤ 2 KB, no stack traces, no PII
}
```

### "How do I get the logs?" — two paths

1. **Automatic (primary).** Every Testflight build auto-POSTs errors. I query `app_telemetry_events` in Postgres (`psql` or later a small admin page) filtered by `install_id` or `received_at`. No tester action required.
2. **Manual fallback.** When auto-submit is impossible (airplane mode, resolve never returns so no error event fires, or the tester reports a UI glitch unrelated to a network call): tester opens Settings → Diagnostics → "Logs exportieren". `DiagnosticsExporter` reads the unified log, hands a `.log` file to the share sheet. Tester sends it to me via Mail/AirDrop/Slack.

## Files to modify

**Apple** (`apps/Apple/`)
- `App/Shared/Utils/BuildChannel.swift` (NEW)
- `App/Shared/Diagnostics/TelemetryEvent.swift` (NEW)
- `App/Shared/Diagnostics/TelemetryClient.swift` (NEW)
- `App/Shared/Diagnostics/InstallID.swift` (NEW)
- `App/Shared/Diagnostics/DiagnosticsExporter.swift` (NEW)
- `App/Shared/API/MusicCloudAPI.swift` (hook in `resolve` catch)
- `ShareExtension/ShareViewController.swift` (hook in catch)
- `App/iOS/Views/Settings/iOSSettingsView.swift` (Testflight-gated section)
- `App/macOS/Views/Dashboard/AboutView.swift` (replace placeholder)
- `musiccloud.xcodeproj` — Shared Keychain access group across App + ShareExtension.

**Backend** (`apps/backend/`)
- `package.json` (+ `@fastify/rate-limit`)
- `src/server.ts` (register rate-limit, register new route)
- `src/routes/telemetry-app-error.ts` (NEW)
- `src/services/telemetry-app.ts` (NEW)
- `src/db/schemas/postgres.ts` (new table)
- `src/db/migrations/postgres/0016_app_telemetry_events.sql` (NEW)
- `src/db/adapters/postgres.ts` (insert helper)

**Shared** (`packages/shared/`)
- `src/endpoints.ts` (add `telemetry.appError`)

## Verification

1. `npm install` in `App/`, `npm run db:migrate`, then `npm run dev:all`.
2. Backend unit test: `apps/backend/src/__tests__/telemetry-app-error.test.ts` — POSTs a valid + an oversized body, asserts 204 / 413 / 429 (rate-limit) behavior. Run via `npx vitest run` in `apps/backend`.
3. Open Apple project, switch scheme to a Release-archive Testflight upload path (or temporarily force `BuildChannel.current = .testflight`), trigger a known-bad URL like `https://music.apple.com/xx/album/???` → expect `appTelemetryEvents` row within seconds: `psql $DATABASE_URL -c "select received_at,event_type,service,error_kind,message from app_telemetry_events order by received_at desc limit 5;"`.
4. Airplane mode → trigger same error → toggle network back on → relaunch → row should arrive (drained from local JSONL buffer).
5. Settings → Diagnostics → "Logs exportieren" → share sheet hands out a non-empty `.log` file with JSONL entries covering the last hour.
6. App Store build (`BuildChannel.current = .appStore`): Diagnostics section hidden; `TelemetryClient.report` is a no-op (add a unit test that asserts no URLSession call is made).
7. Re-run CodeQL locally (or wait for next push): `js/missing-rate-limiting` alerts on `admin-*.ts` should clear once `@fastify/rate-limit` is registered globally.

## Completed

- **Date:** 2026-04-28 (retroactive — plan was executed earlier, archived during housekeeping)
- **Delivered (Swift):**
  - `apps/Apple/App/Shared/Utils/BuildChannel.swift` (.debug / .testflight / .appStore detection).
  - `apps/Apple/App/Shared/Diagnostics/TelemetryClient.swift`, `DiagnosticsExporter.swift`, `InstallID.swift`.
- **Delivered (backend):**
  - `apps/backend/src/routes/telemetry-app-error.ts` — public POST endpoint.
  - `app_telemetry_events` schema in `apps/backend/src/db/schemas/postgres.ts` with required columns + indexes.
  - `@fastify/rate-limit ^10.3.0` in `apps/backend/package.json`.
  - Telemetry test exists: `apps/backend/src/__tests__/telemetry-app-error.test.ts` (5 tests, green).
- **Side effect realised:** rate-limit registration silenced the 10 open CodeQL `js/missing-rate-limiting` alerts on admin routes (per plan §Context).
