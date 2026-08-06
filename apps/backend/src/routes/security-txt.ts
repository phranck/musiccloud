/**
 * @file Serves the signed security contact at `/.well-known/security.txt`.
 *
 * The file is written and OpenPGP-signed by the deployment workflow before the
 * Zerops push, not generated here: producing a signature at request time would
 * require the signing key inside the running service.
 *
 * The route is hidden from the OpenAPI document. It is not part of the public
 * API contract, and `assertStablePublicOperationIds` in
 * `../openapi/export-public-openapi.ts` requires an `operationId` for every
 * documented operation, which a static file route has no business carrying.
 */

import { existsSync, readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";

/**
 * Location of the file produced during deployment.
 *
 * The deployed layout keeps the workspace structure and starts from the repository
 * root, whilst a local run starts inside the package, so both are tried.
 */
const SECURITY_TXT_PATH = existsSync("apps/backend/public/.well-known/security.txt")
  ? "apps/backend/public/.well-known/security.txt"
  : "public/.well-known/security.txt";

export default async function securityTxtRoutes(app: FastifyInstance) {
  app.get(
    "/.well-known/security.txt",
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      let body: string;
      try {
        body = readFileSync(SECURITY_TXT_PATH, "utf8");
      } catch (error) {
        app.log.error(
          { err: error, path: SECURITY_TXT_PATH },
          "security.txt is missing from the deployment",
        );
        return reply.code(404).send();
      }

      // RFC 9116 section 3 requires text/plain with the charset parameter set
      // to utf-8, so the header is set explicitly rather than inferred.
      return reply
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Cache-Control", "public, max-age=3600")
        .send(body);
    },
  );
}
