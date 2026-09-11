/**
 * @file Where an account's picture comes from.
 *
 * A developer may hold three at once: one they uploaded, one Gravatar answered
 * with, and one GitHub handed over. This names the three and nothing else, so
 * the portal and the backend agree on the words the column stores.
 */

/** The three places a picture can come from. */
export const AvatarSource = {
  /** The picture an identity provider handed over, which today means GitHub. */
  Provider: "provider",
  /** The picture the developer uploaded. */
  Upload: "upload",
  /** The picture Gravatar answered with. */
  Gravatar: "gravatar",
} as const;

/** One of the sources in {@link AvatarSource}. */
export type AvatarSourceValue = (typeof AvatarSource)[keyof typeof AvatarSource];

/**
 * Whether a value from the account payload names one of the three.
 *
 * @param value - What the payload carried, which may be `null`.
 * @returns Whether it is a source this portal draws.
 */
export function isAvatarSource(value: unknown): value is AvatarSourceValue {
  return typeof value === "string" && (Object.values(AvatarSource) as string[]).includes(value);
}
