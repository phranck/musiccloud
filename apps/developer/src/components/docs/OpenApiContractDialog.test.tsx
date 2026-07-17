import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpenApiContractDialog } from "./OpenApiContractDialog";

describe("OpenApiContractDialog", () => {
  it("composes the shared dialog frame with an accessible trigger and close control", () => {
    const html = renderToStaticMarkup(
      <>
        <OpenApiContractDialog.Trigger
          aria-controls="openapi-contract-dialog"
          aria-haspopup="dialog"
          data-openapi-contract-trigger
        >
          View OpenAPI contract
        </OpenApiContractDialog.Trigger>
        <OpenApiContractDialog id="openapi-contract-dialog" aria-labelledby="openapi-contract-dialog-title">
          <OpenApiContractDialog.Header>
            <OpenApiContractDialog.Header.Title id="openapi-contract-dialog-title">
              Public OpenAPI contract
            </OpenApiContractDialog.Header.Title>
            <OpenApiContractDialog.Header.Addon>
              <OpenApiContractDialog.Header.Close aria-label="Close OpenAPI contract" data-openapi-contract-close>
                Close
              </OpenApiContractDialog.Header.Close>
            </OpenApiContractDialog.Header.Addon>
          </OpenApiContractDialog.Header>
          <OpenApiContractDialog.Body>Contract</OpenApiContractDialog.Body>
        </OpenApiContractDialog>
      </>,
    );

    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('class="button button--content openapi-contract-dialog__trigger"');
    expect(html).toMatch(
      /<dialog[^>]*id="openapi-contract-dialog"[^>]*class="api-dialog surface-card openapi-contract-dialog"/,
    );
    expect(html).toContain('class="api-dialog__header"');
    expect(html).toContain('class="api-dialog__body"');
    expect(html).toContain("openapi-contract-dialog__close");
    expect(html).toContain("button--icon");
  });
});
