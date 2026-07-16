/**
 * Owner-managed availability controls for the Developer Portal.
 *
 * The dashboard talks to the admin endpoint, while the Astro middleware uses
 * the separate internal endpoint. Keeping those boundaries distinct prevents
 * the portal from needing a database connection or dashboard credentials.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

import { requireOwner } from "../lib/admin-caller.js";
import { getSetting, setSetting } from "../services/site-settings.js";

const PORTAL_PUBLIC_KEY = "developer_portal_public";
const PORTAL_MAINTENANCE_KEY = "developer_portal_maintenance";

export interface DeveloperPortalAvailability {
  maintenance: boolean;
  public: boolean;
}

async function readPortalAvailability(): Promise<DeveloperPortalAvailability> {
  const [publicValue, maintenanceValue] = await Promise.all([
    getSetting(PORTAL_PUBLIC_KEY),
    getSetting(PORTAL_MAINTENANCE_KEY),
  ]);

  return {
    public: publicValue === "true",
    maintenance: maintenanceValue === "true",
  };
}

async function writePortalAvailability(next: DeveloperPortalAvailability): Promise<DeveloperPortalAvailability> {
  await Promise.all([
    setSetting(PORTAL_PUBLIC_KEY, String(next.public)),
    setSetting(PORTAL_MAINTENANCE_KEY, String(next.maintenance)),
  ]);
  return readPortalAvailability();
}

const availabilityBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["public", "maintenance"],
  properties: {
    public: { type: "boolean" },
    maintenance: { type: "boolean" },
  },
} as const;

/** Registers owner-only dashboard reads and writes of the portal state. */
export async function developerPortalAvailabilityAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get(ENDPOINTS.admin.developer.portalAvailability, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    return readPortalAvailability();
  });

  app.patch<{ Body: DeveloperPortalAvailability }>(
    ENDPOINTS.admin.developer.portalAvailability,
    { schema: { body: availabilityBodySchema } },
    async (request, reply) => {
      if (!(await requireOwner(request, reply))) return;
      return writePortalAvailability(request.body);
    },
  );
}

/** Registers the internal read consumed by the Developer Portal middleware. */
export async function developerPortalAvailabilityInternalRoutes(app: FastifyInstance): Promise<void> {
  app.get(ENDPOINTS.internal.developer.portalAvailability, async () => readPortalAvailability());
}
