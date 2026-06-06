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
  },
} satisfies ReactDoctorConfig;

export default config;
