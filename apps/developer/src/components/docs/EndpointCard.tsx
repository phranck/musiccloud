/**
 * Request-specific specialization of ContentCard.
 *
 * The endpoint card preserves shared card structure while constraining request
 * headers to a monospace method/path unit and a high-value access add-on.
 */
import { createCompoundElement } from "@/components/compoundElement";
import { ContentCard } from "@/components/docs/ContentCard";
import { EndpointCardHeader, EndpointCardHeaderAddon, EndpointCardRoot } from "@/components/docs/EndpointCardParts";

const EndpointCardRequest = createCompoundElement("div", "endpoint-card__request");
const EndpointCardMethod = createCompoundElement("code", "endpoint-card__method");
const EndpointCardPath = createCompoundElement("code", "endpoint-card__path");
const EndpointCardAccess = createCompoundElement("span", "status-pill endpoint-card__access");

/** Compound request card used by generated endpoint operations. */
export const EndpointCard = Object.assign(EndpointCardRoot, {
  Header: Object.assign(EndpointCardHeader, {
    Request: Object.assign(EndpointCardRequest, {
      Method: EndpointCardMethod,
      Path: EndpointCardPath,
    }),
    Addon: Object.assign(EndpointCardHeaderAddon, {
      Access: EndpointCardAccess,
    }),
  }),
  Body: ContentCard.Body,
});
