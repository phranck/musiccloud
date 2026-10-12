import { vi } from "vitest";

// Test-default env so importing server.ts / resolve routes does not throw on
// missing CORS_ORIGIN / ALLOWED_ORIGINS. Real values come from .env.local at
// runtime, and these are stubs for tests only.
process.env.CORS_ORIGIN ??= "http://localhost:3000,http://localhost:4321";
process.env.ALLOWED_ORIGINS ??=
  "https://musiccloud.io,http://localhost:3000,http://localhost:4321,http://localhost:4322";
// Disable the Jamendo request throttle in tests so the module-global gate does
// not space mocked-fetch calls 350ms apart across the suite.
process.env.JAMENDO_MIN_GAP_MS ??= "0";

// `fetchWithTimeout` in `src/lib/infra/fetch.ts` resolves every host before it
// calls `fetch`, because its SSRF guard checks the addresses first. The lookup
// therefore runs even where `fetch` is mocked, and a slow DNS answer under the
// request's 5 s timer fails a test that never meant to touch the network. Every
// name answers with one public address here, and `localhost` with the loopback
// address the guard refuses. `fetch.test.ts` injects its own resolver where it
// tests the guard.
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async (hostname: string) =>
    hostname === "localhost" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "93.184.216.34", family: 4 }],
  );
  return { default: { lookup }, lookup };
});

// Mock fetch for API tests
global.fetch = vi.fn();
