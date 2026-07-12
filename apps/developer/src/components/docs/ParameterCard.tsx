/** Parameter-specific compound built on the shared ContentPanel surface. */
import { createCompoundElement } from "@/components/compoundElement";
import { ParameterCardRoot } from "@/components/docs/ParameterCardRoot";

const ParameterCardHeader = createCompoundElement("dt", "content-panel__header parameter-card__header");
const ParameterCardName = createCompoundElement("code", "parameter-card__name");
const ParameterCardLocation = createCompoundElement("span", "parameter-card__location");
const ParameterCardRequirement = createCompoundElement("span", "parameter-card__requirement");
const ParameterCardBody = createCompoundElement("dd", "content-panel__content parameter-card__body");

/** Compound parameter row with explicit metadata and description ownership. */
export const ParameterCard = Object.assign(ParameterCardRoot, {
  Header: Object.assign(ParameterCardHeader, {
    Name: ParameterCardName,
    Location: ParameterCardLocation,
    Requirement: ParameterCardRequirement,
  }),
  Body: ParameterCardBody,
});
