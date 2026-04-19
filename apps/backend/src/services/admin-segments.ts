import type { PageSegment, PageSegmentInput } from "@musiccloud/shared";

import { getAdminRepository } from "../db/index.js";

export type SegmentsResult =
  | { ok: true; data: PageSegment[] }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID_INPUT" | "TARGET_NOT_FOUND" | "TARGET_NOT_DEFAULT";
      message: string;
    };

export async function replaceSegments(
  ownerSlug: string,
  inputs: PageSegmentInput[],
): Promise<SegmentsResult> {
  const repo = await getAdminRepository();
  const owner = await repo.getContentPageBySlug(ownerSlug);
  if (!owner) return { ok: false, code: "NOT_FOUND", message: `no page '${ownerSlug}'` };
  if (owner.pageType !== "segmented") {
    return { ok: false, code: "INVALID_INPUT", message: "owner page is not of type 'segmented'" };
  }

  for (const s of inputs) {
    if (!s.label.trim()) {
      return { ok: false, code: "INVALID_INPUT", message: "segment label must not be empty" };
    }
    if (s.targetSlug === ownerSlug) {
      return { ok: false, code: "INVALID_INPUT", message: "segment cannot target its owner" };
    }
  }

  const uniqueTargets = Array.from(new Set(inputs.map((s) => s.targetSlug)));
  const targetRows = uniqueTargets.length > 0 ? await repo.getContentPagesBySlugs(uniqueTargets) : [];
  const byTarget = new Map(targetRows.map((r) => [r.slug, r]));

  for (const s of inputs) {
    const row = byTarget.get(s.targetSlug);
    if (!row) {
      return {
        ok: false,
        code: "TARGET_NOT_FOUND",
        message: `segment target '${s.targetSlug}' not found`,
      };
    }
    if (row.pageType !== "default") {
      return {
        ok: false,
        code: "TARGET_NOT_DEFAULT",
        message: `segment target '${s.targetSlug}' must be a default page`,
      };
    }
  }

  const normalised = inputs
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s, i) => ({ position: i, label: s.label.trim(), targetSlug: s.targetSlug }));

  const rows = await repo.replaceSegmentsForOwner(ownerSlug, normalised);
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
