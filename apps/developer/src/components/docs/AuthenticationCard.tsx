/**
 * API-key authentication guidance presented with the same card hierarchy as
 * documented responses while retaining its own semantic title and content.
 */
import { createCompoundElement } from "@/components/compoundElement";

const AuthenticationCardRoot = createCompoundElement("section", "content-panel authentication-card");
const AuthenticationCardStatus = createCompoundElement("div", "authentication-card__status");
const AuthenticationCardStatusIcon = createCompoundElement("span", "authentication-card__icon");
const AuthenticationCardStatusTitle = createCompoundElement("h4", "authentication-card__title");
const AuthenticationCardContent = createCompoundElement("div", "authentication-card__content");

/** Compound API-key guidance card used by generated endpoint documentation. */
export const AuthenticationCard = Object.assign(AuthenticationCardRoot, {
  Status: Object.assign(AuthenticationCardStatus, {
    Icon: AuthenticationCardStatusIcon,
    Title: AuthenticationCardStatusTitle,
  }),
  Content: AuthenticationCardContent,
});
