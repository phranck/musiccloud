/**
 * @file Test support for files that render `UsageChart`.
 */
import { loadUsageChartFigure } from "@musiccloud/dashboard-ui";
import { beforeAll } from "vitest";

/**
 * How long loading the chart's drawing half may take.
 *
 * The time depends on how busy the machine is. On an idle one it is well under
 * a second, and in the full `pnpm test:run`, where every workspace runs its
 * suite at once, it has taken longer than the five seconds a test is given.
 */
const CHART_LOAD_TIMEOUT_MS = 30_000;

/**
 * Loads the chart's drawing half before the first test of the calling file.
 *
 * `UsageChart` imports that half lazily, so without this the first test that
 * renders a chart pays for loading the charting library within its own time
 * limit. Loaded in a hook, the import resolves before any test starts and each
 * test measures only its own work.
 *
 * Call it once at the top level of a test file.
 */
export function preloadUsageChart(): void {
  beforeAll(async () => {
    await loadUsageChartFigure();
  }, CHART_LOAD_TIMEOUT_MS);
}
