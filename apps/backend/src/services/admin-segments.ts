import type { PageSegment, PageSegmentInput } from "@musiccloud/shared";
import type { PageSegmentInputRow } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

export type SegmentsResult =
  | { ok: true; data: PageSegment[] }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID_INPUT" | "TARGET_NOT_FOUND" | "TARGET_NOT_DEFAULT";
      message: string;
    };

/** Why one segment of a set is refused. */
export interface SegmentInputError {
  code: "INVALID_INPUT" | "TARGET_NOT_FOUND" | "TARGET_NOT_DEFAULT";
  /** The segment's index in the set as it was given. */
  index: number;
  message: string;
}

/**
 * Checks the segments an owner page is about to list. The single segment save
 * and the bulk save both run it, so the two refuse the same segments for the
 * same reasons and with the same words.
 *
 * Whether the owner itself may carry segments is the caller's question,
 * because the bulk save reports it once per owner rather than once per segment.
 *
 * @param ownerSlug - The slug of the page that lists the segments.
 * @param inputs - The segments in the order they were given.
 * @param pageTypeOf - The page type a slug will have once the write is done, or
 *   `undefined` where no page has that slug. The bulk save answers with its own
 *   pending page type changes laid over the stored ones.
 * @returns Every refusal, in segment order. Empty when the set is acceptable.
 */
export function validateSegmentInputs(
  ownerSlug: string,
  inputs: readonly PageSegmentInput[],
  pageTypeOf: (slug: string) => string | undefined,
): SegmentInputError[] {
  const errors: SegmentInputError[] = [];
  inputs.forEach((segment, index) => {
    if (!segment.label.trim()) {
      errors.push({ code: "INVALID_INPUT", index, message: `segment[${index}] label must not be empty` });
    }
    if (segment.targetSlug === ownerSlug) {
      errors.push({ code: "INVALID_INPUT", index, message: `segment[${index}] cannot target its owner` });
    }
    const targetType = pageTypeOf(segment.targetSlug);
    if (targetType === undefined) {
      errors.push({
        code: "TARGET_NOT_FOUND",
        index,
        message: `segment[${index}] target '${segment.targetSlug}' not found`,
      });
    } else if (targetType !== "default") {
      errors.push({
        code: "TARGET_NOT_DEFAULT",
        index,
        message: `segment[${index}] target '${segment.targetSlug}' must be a default page`,
      });
    }
  });
  return errors;
}

/**
 * Puts accepted segments into the shape they are stored in: ordered by the
 * position they were given, numbered from 0 without gaps, and with their
 * labels trimmed.
 *
 * @param inputs - Segments that passed {@link validateSegmentInputs}.
 * @returns The rows to store, in display order.
 */
export function normalizeSegmentInputs(inputs: readonly PageSegmentInput[]): PageSegmentInputRow[] {
  return inputs
    .slice()
    .sort((first, second) => first.position - second.position)
    .map((segment, position) => ({ position, label: segment.label.trim(), targetSlug: segment.targetSlug }));
}

export async function replaceSegments(ownerSlug: string, inputs: PageSegmentInput[]): Promise<SegmentsResult> {
  const repo = await getAdminRepository();
  const owner = await repo.getContentPageBySlug(ownerSlug);
  if (!owner) return { ok: false, code: "NOT_FOUND", message: `no page '${ownerSlug}'` };
  if (owner.pageType !== "segmented") {
    return { ok: false, code: "INVALID_INPUT", message: "owner page is not of type 'segmented'" };
  }

  const uniqueTargets = Array.from(new Set(inputs.map((segment) => segment.targetSlug)));
  const targetRows = uniqueTargets.length > 0 ? await repo.getContentPagesBySlugs(uniqueTargets) : [];
  const pageTypes = new Map(targetRows.map((row) => [row.slug, row.pageType]));

  const [refusal] = validateSegmentInputs(ownerSlug, inputs, (slug) => pageTypes.get(slug));
  if (refusal) return { ok: false, code: refusal.code, message: refusal.message };

  const rows = await repo.replaceSegmentsForOwner(ownerSlug, normalizeSegmentInputs(inputs));

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      targetSlug: r.targetSlug,
    })),
  };
}

export async function listSegments(ownerSlug: string): Promise<SegmentsResult> {
  const repo = await getAdminRepository();
  const owner = await repo.getContentPageBySlug(ownerSlug);
  if (!owner) return { ok: false, code: "NOT_FOUND", message: `no page '${ownerSlug}'` };
  const rows = await repo.listSegmentsForOwner(ownerSlug);
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      targetSlug: r.targetSlug,
    })),
  };
}
