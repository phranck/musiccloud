import strictReactDoctorConfig from "react-doctor-config-strict";
import type { ReactDoctorConfig } from "react-doctor/api";

/**
 * Project-local React Doctor config.
 *
 * The reusable strict policy lives in `react-doctor-config-strict`.
 * Keep this file limited to project-specific suppressions and overrides.
 */
const config = {
  ...strictReactDoctorConfig,
  ignore: {
    ...strictReactDoctorConfig.ignore,
    files: [
      /**
       * React Doctor/deslop can still report these already-deleted dashboard
       * paths from the previous tree. Keep this scoped until the scanner stops
       * seeing them.
       */
      "src/components/ui/CrossFade.tsx",
      "src/lib/loadNav.ts",
      /**
       * resolveMode.ts is a new module-level store created in Task 1 of the
       * CC-path plan (2026-06-21-cc-pfad-frontend). It will be consumed by
       * LandingPage.tsx in Task 6. Remove this suppression when Task 6 lands.
       */
      "src/lib/resolve/resolveMode.ts",
    ],
    overrides: [
      /**
       * `@astrojs/check` is a CLI-only dependency: Astro loads it at runtime
       * when `astro check` is invoked from the `check` npm script. There is
       * no source import for the scanner to discover, so the dead-code rule
       * flags it as unused.
       *
       * React Doctor's override globs match relative to each scanned
       * workspace's root, so the only pattern that catches the report is
       * the bare `package.json`. That trades precision for broad suppression
       * of the rule across every workspace package.json. Acceptable today
       * because dashboard / dashboard-ui have no CLI-only dev-deps; revisit
       * if a real unused dev-dep slips through here.
       */
      {
        files: ["package.json"],
        rules: ["deslop/unused-dev-dependency"],
      },
      /**
       * ResolveMode is a new namespace added in Task 1 of the CC-path plan
       * (2026-06-21-cc-pfad-frontend). It will be consumed by resolveMode.ts
       * and LandingPage.tsx in Tasks 1/6. Remove this suppression when Task 6
       * lands and the first real import exists.
       */
      {
        files: ["src/lib/types/app.ts"],
        rules: ["deslop/unused-export"],
      },
    ],
  },
} satisfies ReactDoctorConfig;

export default config;
