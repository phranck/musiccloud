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
import {
  getMaxProjectsPerAccount,
  isAssignableMaxProjects,
  MAX_MAX_PROJECTS_PER_ACCOUNT,
  MIN_MAX_PROJECTS_PER_ACCOUNT,
  setMaxProjectsPerAccount,
} from "../services/developer-limits.js";
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

const limitsBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["maxProjectsPerAccount"],
  properties: {
    maxProjectsPerAccount: {
      type: "integer",
      minimum: MIN_MAX_PROJECTS_PER_ACCOUNT,
      maximum: MAX_MAX_PROJECTS_PER_ACCOUNT,
    },
  },
} as const;

/**
 * Registers the owner-only read and write of the bounds on self-service
 * creation.
 *
 * These sit beside the availability switches because they answer the same kind
 * of question: how open the portal is right now. The route validates the range
 * in its schema and again through `isAssignableMaxProjects`, so a value that
 * reaches the store has passed the same check the reader applies.
 */
export async function developerLimitsAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get(ENDPOINTS.admin.developer.limits, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    return { maxProjectsPerAccount: await getMaxProjectsPerAccount() };
  });

  app.patch<{ Body: { maxProjectsPerAccount: number } }>(
    ENDPOINTS.admin.developer.limits,
    { schema: { body: limitsBodySchema } },
    async (request, reply) => {
      if (!(await requireOwner(request, reply))) return;
      if (!isAssignableMaxProjects(request.body.maxProjectsPerAccount)) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "maxProjectsPerAccount is out of range." });
      }
      await setMaxProjectsPerAccount(request.body.maxProjectsPerAccount);
      return { maxProjectsPerAccount: await getMaxProjectsPerAccount() };
    },
  );
}
