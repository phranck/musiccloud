/**
 * @file Which plan a new account starts on.
 *
 * Whether a developer may put themselves on a plan is decided by the backend
 * and published on the catalogue as `selfServiceAssignable`, so nothing here
 * works it out a second time. What this module adds is the choice between the
 * plan a developer named on the pricing page and the one they get by asking for
 * none, which is what following "Sign up" does.
 */

/** A plan as the public catalogue serves it. Only the fields signup reads. */
export interface SignupCatalogueTier {
  id: string;
  name: string;
  color: string;
  /** Whether a developer may put themselves on it. */
  selfServiceAssignable: boolean;
}

/** The plan the signup form signs an account up for. */
export interface SignupTier {
  id: string;
  name: string;
  color: string;
}

/**
 * Picks the plan a signup runs on.
 *
 * A developer who named one gets that plan when they may take it. A developer
 * who named none gets the first they may take, because arriving with no plan in
 * mind is an ordinary way to sign up and the backend assigns the same plan
 * either way. Naming one that cannot be taken yields nothing, so the caller can
 * send them to the pricing page where the reason stands.
 *
 * @param tiers - The public catalogue, in its own order.
 * @param requestedTierId - The plan named in the query string, if any.
 * @returns The plan to sign up on, or `null` when there is none to offer.
 */
export function selectSignupTier(
  tiers: readonly SignupCatalogueTier[],
  requestedTierId?: string | null,
): SignupTier | null {
  const assignable = tiers.filter((tier) => tier.selfServiceAssignable);
  const chosen = requestedTierId ? assignable.find((tier) => tier.id === requestedTierId) : assignable[0];

  return chosen ? { id: chosen.id, name: chosen.name, color: chosen.color } : null;
}
