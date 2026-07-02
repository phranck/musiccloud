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
       * useEmailBranding.ts and useEmailActions.ts are new hook modules
       * created in Task 9 of the email-template-system-v2 plan
       * (2026-07-02-email-template-system-v2). They will be consumed by the
       * Branding page (Task 11) and the System-Actions page (Task 12)
       * respectively. Remove this suppression when those tasks land and the
       * first real import exists.
       */
      "src/features/templates/hooks/useEmailBranding.ts",
      "src/features/templates/hooks/useEmailActions.ts",
    ],
    overrides: [
      /**
       * The visible loading/resolve affordances moved to the vinyl component in
       * plan MC-031, but `CDSpinArtwork` remains intentionally available as a
       * preserved legacy component until the migration proves stable.
       */
      {
        files: ["src/components/ui/CDSpinArtwork.tsx"],
        rules: ["deslop/unused-file"],
      },
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
    ],
  },
} satisfies ReactDoctorConfig;

export default config;
