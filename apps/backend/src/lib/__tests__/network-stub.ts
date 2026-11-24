/**
 * @file A stand-in for the network in the tests of the outbound fetch, the
 * NodeInfo lookup and the preview reader.
 *
 * The requests still run through the real `fetchWithTimeout`, whose hops
 * `vitest.setup.ts` routes to the global `fetch` stubbed here, so the guard that
 * refuses private targets is the production one.
 */
import { vi } from "vitest";

/**
 * Stubs the network with a handler that answers by address.
 *
 * Each hop reaches the stub with the address `fetchWithTimeout` sends, which
 * drops the slash of a bare origin, so the handler sees the normalized form.
 * The response reports the address it answered for, as undici's does.
 *
 * @param handler - Answers one requested address.
 * @returns The stub, for assertions on its calls.
 */
export function stubNetwork(handler: (url: string, init: RequestInit) => Response) {
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input)).href;
    const response = handler(url, init);
    Object.defineProperty(response, "url", { value: url });
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
