/**
 * @file The parts of the shared package that need Node.
 *
 * They live behind `@musiccloud/shared/node` so the main entry stays usable in
 * the browser, where the dashboard and the islands import it.
 */
export * from "./policy-hash.js";
