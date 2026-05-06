import { vi } from "vitest";

// Test-default env so importing server.ts / resolve routes does not throw on
// missing CORS_ORIGIN / ALLOWED_ORIGINS. Real values come from .env.local at
// runtime — these are test-only stubs.
process.env.CORS_ORIGIN ??= "http://localhost:3000,http://localhost:4321";
process.env.ALLOWED_ORIGINS ??= "https://musiccloud.io,http://localhost:3000,http://localhost:4321,http://localhost:4322";

// Mock fetch for API tests
global.fetch = vi.fn();
