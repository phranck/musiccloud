/**
 * Shared native-dialog frame for API-reference overlays.
 *
 * Domain compounds own their specialised controls and content, while this
 * compound keeps the surface, header, body, and footer geometry identical.
 */
import { createCompoundElement } from "@/components/compoundElement";

const ApiDialogRoot = createCompoundElement("dialog", "api-dialog surface-card");
const ApiDialogHeader = createCompoundElement("header", "api-dialog__header");
const ApiDialogHeaderTitle = createCompoundElement("h2", "api-dialog__header-title");
const ApiDialogHeaderAddon = createCompoundElement("div", "api-dialog__header-addon");
const ApiDialogBody = createCompoundElement("div", "api-dialog__body");
const ApiDialogFooter = createCompoundElement("footer", "api-dialog__footer");
const ApiDialogHeaderClose = createCompoundElement("button", "api-dialog__header-close", { type: "button" });

/** Shared structural slots for document-search and OpenAPI-contract dialogs. */
export const ApiDialog = Object.assign(ApiDialogRoot, {
  Header: Object.assign(ApiDialogHeader, {
    Title: ApiDialogHeaderTitle,
    Addon: ApiDialogHeaderAddon,
    Close: ApiDialogHeaderClose,
  }),
  Body: ApiDialogBody,
  Footer: ApiDialogFooter,
});
