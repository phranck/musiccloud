/**
 * Domain compound for the build-time public OpenAPI-contract viewer.
 *
 * It reuses ApiDialog's structural frame and only owns the contract-specific
 * trigger and close-control recipes. The rendered code is supplied by the
 * caller through the Body slot so it remains the shared CodeBlock component.
 */
import { createCompoundElement } from "@/components/compoundElement";
import { ApiDialog } from "@/components/docs/ApiDialog";

const OpenApiContractDialogRoot = createCompoundElement(ApiDialog, "openapi-contract-dialog");
const OpenApiContractDialogTrigger = createCompoundElement(
  "button",
  "button button--content openapi-contract-dialog__trigger",
  { type: "button" },
);
const OpenApiContractDialogClose = createCompoundElement(
  ApiDialog.Header.Close,
  "button button--icon button--subtle openapi-contract-dialog__close",
);
const OpenApiContractDialogTitle = createCompoundElement(
  ApiDialog.Header.Title,
  "openapi-contract-dialog__header-title",
);
const OpenApiContractDialogHeader = ApiDialog.Header;

/** Public OpenAPI-contract dialog slots. */
export const OpenApiContractDialog = Object.assign(OpenApiContractDialogRoot, {
  Trigger: OpenApiContractDialogTrigger,
  Header: Object.assign(OpenApiContractDialogHeader, {
    Title: OpenApiContractDialogTitle,
    Addon: ApiDialog.Header.Addon,
    Close: OpenApiContractDialogClose,
  }),
  Body: ApiDialog.Body,
});
