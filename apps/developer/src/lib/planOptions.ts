/**
 * @file Turns the public plan catalogue into what the plan step shows.
 *
 * Which plan a developer may choose is decided by the backend and published on
 * the catalogue as `selfServiceAssignable`, so nothing here works it out a
 * second time. What this module adds is the sentence a developer reads for a
 * plan they cannot pick, because a plan that was on the pricing page and then
 * silently disappears is worse than one that says why.
 */

/** A plan as the public catalogue serves it. Only the fields this screen reads. */
export interface PublicTier {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  enabled: boolean;
  /** Whether a developer may put a project on it themselves. */
  selfServiceAssignable: boolean;
  /** The operator's own reason for a plan that is not offered, or an empty string. */
  disableReason?: string;
}

/** A plan as the plan step describes it. */
export interface PlanOption {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  assignable: boolean;
  /** Why it cannot be chosen, or an empty string when it can. */
  unavailableReason: string;
}

/** Why a plan that is offered still cannot be put on a project by its owner. */
const PAID_PLAN_REASON = "Not available yet. Paid plans arrive with billing.";
/** Why a plan the operator switched off cannot be chosen, when no reason was published. */
const DISABLED_PLAN_REASON = "Not currently offered.";

/**
 * Describes each plan for the plan step.
 *
 * @param tiers - The public catalogue, in its own order.
 * @returns One entry per plan, either assignable or carrying the reason it is not.
 */
export function toPlanOptions(tiers: readonly PublicTier[]): PlanOption[] {
  return tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    requestsPerMinute: tier.requestsPerMinute,
    requestsPerDay: tier.requestsPerDay,
    assignable: tier.selfServiceAssignable,
    unavailableReason: tier.selfServiceAssignable
      ? ""
      : tier.enabled
        ? PAID_PLAN_REASON
        : tier.disableReason?.trim() || DISABLED_PLAN_REASON,
  }));
}
