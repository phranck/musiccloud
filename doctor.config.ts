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
       * MC-066 developer-portal BFF session helper. `src/lib/session.ts` is
       * imported only by the protected dashboard pages that land in a later task
       * of the same plan; until then the dead-code rules report it as
       * unimported. The rule is suppressed on the file itself (not via
       * `ignore.files`, which would also drop it as a graph node and cascade a
       * false positive onto `api.ts`'s `internalHeaders` that it imports). Drop
       * this glob once the consumer ships — see the MC-066 plan checklist.
       */
      {
        files: ["src/lib/session.ts"],
        rules: ["deslop/unused-file", "deslop/unused-export"],
      },
    ],
  },
} satisfies ReactDoctorConfig;

export default config;
