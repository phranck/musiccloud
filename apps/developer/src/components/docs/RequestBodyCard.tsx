/** Request-media compound built on the shared ContentPanel surface. */
import { createCompoundElement } from "@/components/compoundElement";
import { RequestBodyCardRoot } from "@/components/docs/RequestBodyCardRoot";

const RequestBodyCardHeader = createCompoundElement("div", "content-panel__header request-body-card__header");
const RequestBodyCardMediaType = createCompoundElement("code", "request-body-card__media-type");
const RequestBodyCardSchemaLink = createCompoundElement("a", "content-link request-body-card__schema-link");
const RequestBodyCardBody = createCompoundElement("div", "content-panel__content request-body-card__body");
const RequestBodyCardExample = createCompoundElement("div", "request-body-card__example");

/** Compound request body with media, schema, and example slots. */
export const RequestBodyCard = Object.assign(RequestBodyCardRoot, {
  Header: Object.assign(RequestBodyCardHeader, {
    MediaType: RequestBodyCardMediaType,
    SchemaLink: RequestBodyCardSchemaLink,
  }),
  Body: Object.assign(RequestBodyCardBody, {
    Example: RequestBodyCardExample,
  }),
});
