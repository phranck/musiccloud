import { ENDPOINTS, IMAGE_UPLOAD_MAX_BYTES, ROUTE_TEMPLATES } from "@musiccloud/shared";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUser } from "../db/admin-repository.js";
import type { DeveloperAccount } from "../db/developer-repository.js";

/**
 * The three routes that take an image as a `data:` URL answer the same inputs
 * the same way, because they share one rule. A route that grows its own copy
 * again shows up here as the one row that disagrees.
 */

const adminRepo = { findAdminById: vi.fn(), updateAdminUser: vi.fn() };
const developerRepo = { updateDeveloperAccount: vi.fn() };
const createManagedEmailAsset = vi.fn();

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => adminRepo,
  getDeveloperRepository: async () => developerRepo,
  getTierRepository: async () => ({ listTiers: async () => [] }),
}));
vi.mock("../services/email-templates.js", () => ({
  createManagedEmailAsset: (...args: unknown[]) => createManagedEmailAsset(...args),
  listManagedEmailAssets: async () => [],
}));
vi.mock("../services/email-actions.js", () => ({ triggerEmailAction: vi.fn() }));
vi.mock("../services/gdpr-erase.js", () => ({ erasePersonalData: vi.fn() }));
vi.mock("../services/gdpr-export.js", () => ({ buildPersonalDataExport: vi.fn() }));
vi.mock("../lib/env.js", () => ({ requireEnv: () => "http://dashboard.test" }));

import adminEmailAssetsRoutes from "./admin-email-assets.js";
import adminUserRoutes from "./admin-users.js";
import { devAuthRoutes } from "./developer-auth.js";

const admin = {
  id: "admin-1",
  username: "owner",
  passwordHash: "hash",
  email: "owner@example.com",
  role: "owner",
  firstName: null,
  lastName: null,
  avatarUrl: null,
  sessionTimeoutMinutes: null,
  createdAt: 1_700_000_000_000,
  lastLoginAt: null,
} as unknown as AdminUser;

const developer = {
  id: "dev-1",
  email: "dev@example.com",
  emailVerifiedAt: 1_700_000_000_000,
  passwordHash: "hash",
  displayName: null,
  pendingEmail: null,
  firstName: null,
  lastName: null,
  avatarUrl: null,
  uploadedAvatarUrl: null,
  gravatarUrl: null,
  avatarSource: null,
  technicalContactEmail: null,
  status: "active",
  createdAt: 1_700_000_000_000,
} as unknown as DeveloperAccount;

/** The developer routes, signed in through a stand-in for the session guard. */
async function developerApp(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate("authenticateDeveloper", async (request: FastifyRequest) => {
    request.developerAccountId = developer.id;
    request.developerAccount = developer;
  });
  await app.register(devAuthRoutes);
  await app.ready();
  return app;
}

/** An admin route group, signed in as the owner the way the admin scope's guard leaves a request. */
async function adminApp(routes: (app: FastifyInstance) => Promise<void>): Promise<FastifyInstance> {
  const app = Fastify();
  app.addHook("preHandler", (request, _reply, done) => {
    (request as unknown as { user: unknown }).user = { sub: admin.id, role: "admin" };
    done();
  });
  await app.register(routes);
  await app.ready();
  return app;
}

/**
 * A base64 `data:` URL whose payload decodes to the given number of bytes.
 *
 * @param mimeType - The media type the URL names.
 * @param bytes - How many bytes the payload decodes to.
 * @returns The data URL.
 */
function imageDataUrl(mimeType: string, bytes = 16): string {
  return `data:${mimeType};base64,${Buffer.alloc(bytes, 1).toString("base64")}`;
}

const ROUTES = [
  { route: "the developer avatar", build: developerApp, url: ENDPOINTS.dev.auth.avatar },
  {
    route: "the admin user avatar",
    build: () => adminApp(adminUserRoutes),
    url: ROUTE_TEMPLATES.admin.users.avatar.replace(":id", admin.id),
  },
  {
    route: "the admin email asset",
    build: () => adminApp(adminEmailAssetsRoutes),
    url: ENDPOINTS.admin.emailAssets.list,
  },
];

const INPUTS = [
  { input: "an SVG", dataUrl: imageDataUrl("image/svg+xml"), accepted: false },
  { input: "a GIF", dataUrl: imageDataUrl("image/gif"), accepted: false },
  {
    input: "a JPEG one byte over the cap",
    dataUrl: imageDataUrl("image/jpeg", IMAGE_UPLOAD_MAX_BYTES + 1),
    accepted: false,
  },
  { input: "a small JPEG", dataUrl: imageDataUrl("image/jpeg"), accepted: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  adminRepo.findAdminById.mockResolvedValue(admin);
  adminRepo.updateAdminUser.mockResolvedValue(admin);
  developerRepo.updateDeveloperAccount.mockResolvedValue(developer);
  createManagedEmailAsset.mockResolvedValue({ id: "asset-1" });
});

describe.each(ROUTES)("$route", ({ build, url }) => {
  it.each(INPUTS)("answers $input as accepted: $accepted", async ({ dataUrl, accepted }) => {
    const app = await build();

    const response = await app.inject({ method: "POST", url, payload: { dataUrl } });

    const outcome = response.statusCode < 300 ? "accepted" : response.statusCode;
    expect(outcome, response.body).toBe(accepted ? "accepted" : 400);
    await app.close();
  });
});

describe("the admin email asset", () => {
  it("stores the decoded bytes with the type the upload named", async () => {
    const app = await adminApp(adminEmailAssetsRoutes);

    await app.inject({
      method: "POST",
      url: ENDPOINTS.admin.emailAssets.list,
      payload: { dataUrl: imageDataUrl("image/png", 16) },
    });

    expect(createManagedEmailAsset).toHaveBeenCalledWith({ mimeType: "image/png", bytes: Buffer.alloc(16, 1) });
    await app.close();
  });
});
