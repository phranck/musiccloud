/**
 * Compound API-response card with a reusable status marker and content column.
 *
 * The root owns the tone-specific card surface, `Status` owns icon/code
 * alignment, and `Content` keeps descriptions plus media details in one
 * stable column. This prevents each operation renderer from rebuilding the
 * same response layout.
 */
import { createCompoundElement } from "@/components/compoundElement";
import { ResponseCardRoot } from "@/components/docs/ResponseCardRoot";
import { ResponseCardStatus } from "@/components/docs/ResponseCardStatus";

const ResponseCardContent = createCompoundElement("div", "response-card__content");

/** Compound response-card API used by generated endpoint documentation. */
export const ResponseCard = Object.assign(ResponseCardRoot, {
  Status: ResponseCardStatus,
  Content: ResponseCardContent,
});

export type { ResponseToneValue as ResponseTone } from "@/components/docs/responseCard.types";
