/**
 * @file What the backend accepts from App Attest: which app, which Apple
 * environment, and which kinds of build.
 */

/** The two App Attest environments Apple distinguishes. */
export type AppAttestEnvironment = "production" | "development";

/**
 * The App ID of the musiccloud Apple app: the team prefix, a period, and the
 * bundle identifier. The app is one multiplatform target, so its macOS signing
 * identifier, which App Attest uses on macOS in place of the bundle identifier,
 * is the same string.
 */
export const MUSICCLOUD_APP_ID = "2Z5E3BGZR8.io.musiccloud.musiccloud";

/** The `aaguid` of a key Apple's production App Attest service attested: `appattest` and seven zero bytes. */
export const PRODUCTION_AAGUID = Buffer.concat([Buffer.from("appattest", "ascii"), Buffer.alloc(7)]);

/** The `aaguid` of a key Apple's development App Attest service attested. */
export const DEVELOPMENT_AAGUID = Buffer.from("appattestdevelop", "ascii");

/**
 * Apple's launch validation categories, as `apple_validation_category_01`
 * reports them inside the authenticator data.
 */
export const AppAttestValidationCategory = {
  TestFlight: 2,
  Development: 3,
  AppStore: 4,
  DeveloperId: 6,
} as const;

/**
 * Everything a verification compares against that is not in the request.
 *
 * @property appIds - The App IDs whose SHA-256 may appear as the RP ID hash.
 * @property environments - The environments whose keys are accepted, each with its `aaguid`.
 * @property validationCategories - The launch categories accepted when the
 *   authenticator data names one. An attestation from an operating system that
 *   predates the field names none and is not refused for that.
 */
export interface AppAttestPolicy {
  appIds: readonly string[];
  environments: ReadonlyArray<{ environment: AppAttestEnvironment; aaguid: Buffer }>;
  validationCategories: readonly number[];
}

/**
 * The policy this process enforces.
 *
 * Production accepts keys from Apple's production environment only, and
 * builds from the App Store, TestFlight, or signed with Developer ID. Any other
 * `NODE_ENV` also accepts development keys and development-signed builds, which
 * is what an app run from Xcode presents. The decision follows `NODE_ENV`
 * alone, so a production backend cannot be talked into the wider set.
 *
 * @param nodeEnv - The process's `NODE_ENV`.
 * @returns The policy for that environment.
 */
export function buildAppAttestPolicy(nodeEnv: string | undefined): AppAttestPolicy {
  const production = { environment: "production" as const, aaguid: PRODUCTION_AAGUID };
  const releaseCategories = [
    AppAttestValidationCategory.TestFlight,
    AppAttestValidationCategory.AppStore,
    AppAttestValidationCategory.DeveloperId,
  ];
  if (nodeEnv === "production") {
    return { appIds: [MUSICCLOUD_APP_ID], environments: [production], validationCategories: releaseCategories };
  }
  return {
    appIds: [MUSICCLOUD_APP_ID],
    environments: [production, { environment: "development", aaguid: DEVELOPMENT_AAGUID }],
    validationCategories: [...releaseCategories, AppAttestValidationCategory.Development],
  };
}
