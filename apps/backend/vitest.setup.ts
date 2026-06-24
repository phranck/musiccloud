import { vi } from "vitest";

// Test-default env so importing server.ts / resolve routes does not throw on
// missing CORS_ORIGIN / ALLOWED_ORIGINS. Real values come from .env.local at
// runtime — these are test-only stubs.
process.env.CORS_ORIGIN ??= "http://localhost:3000,http://localhost:4321";
process.env.ALLOWED_ORIGINS ??=
  "https://musiccloud.io,http://localhost:3000,http://localhost:4321,http://localhost:4322";
// Disable the Jamendo request throttle in tests so the module-global gate does
// not space mocked-fetch calls 350ms apart across the suite.
process.env.JAMENDO_MIN_GAP_MS ??= "0";

// Mock fetch for API tests
global.fetch = vi.fn();
