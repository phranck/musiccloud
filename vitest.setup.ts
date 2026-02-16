import '@testing-library/jest-dom';
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables if needed
vi.stubGlobal('ENV', {
  PUBLIC_API_BASE: 'http://localhost:3000',
});

// Mock fetch for API tests
global.fetch = vi.fn();
