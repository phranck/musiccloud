/**
 * @file Service tests for the GDPR export package builder (MC-085): collects
 * a subject's personal data across the developer-account, API-access and
 * form-submission domains into one versioned JSON structure. All three
 * repositories are stubbed; the assembly logic runs for real.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminRepository, getApiAccessRepository, getDeveloperRepository } from "../../db/index.js";
import { buildPersonalDataExport } from "../gdpr-export.js";

vi.mock("../../db/index.js", () => ({
  getAdminRepository: vi.fn(),
  getApiAccessRepository: vi.fn(),
  getDeveloperRepository: vi.fn(),
}));

const ACCOUNT = {
  id: "dev-acc-1",
  email: "dev@example.com",
  emailVerifiedAt: 1_700_000_000_000,
  passwordHash: "$2b$secret-hash",
  displayName: "Dev Jane",
  avatarUrl: null,
  plan: "free",
  status: "active",
  createdAt: 1_699_000_000_000,
  updatedAt: 1_699_000_000_000,
  lastLoginAt: null,
};

const SUBMISSION = {
  id: 7,
  formConfigId: 42,
  data: { message: "Hello" },
  submitterEmail: "dev@example.com",
  createdAt: new Date("2026-07-01T00:00:00Z"),
};

function makeRepos() {
  const adminRepo = {
    listFormSubmissionsBySubject: vi.fn(async () => [SUBMISSION]),
  };
  const developerRepo = {
    findDeveloperAccountById: vi.fn(async () => ACCOUNT),
    listDeveloperIdentitiesByAccount: vi.fn(async () => [
      { id: "ident-1", accountId: "dev-acc-1", provider: "github", providerUserId: "12345", createdAt: 1 },
    ]),
  };
  const apiAccessRepo = {
    listApiAccessRequestsByDeveloperAccount: vi.fn(async () => [{ id: "req-1", appName: "My App" }]),
    listApiClientsByDeveloperAccount: vi.fn(async () => [{ id: "client-1", appName: "My App" }]),
    listApiClientTokensByClient: vi.fn(async () => [{ id: "token-1", tokenPrefix: "mc_abc", status: "active" }]),
  };
  return { adminRepo, developerRepo, apiAccessRepo };
}

let repos: ReturnType<typeof makeRepos>;

beforeEach(() => {
  vi.clearAllMocks();
  repos = makeRepos();
  vi.mocked(getAdminRepository).mockResolvedValue(repos.adminRepo as never);
  vi.mocked(getDeveloperRepository).mockResolvedValue(repos.developerRepo as never);
  vi.mocked(getApiAccessRepository).mockResolvedValue(repos.apiAccessRepo as never);
});

describe("buildPersonalDataExport", () => {
  it("assembles every domain for an account subject and strips the password hash", async () => {
    const pkg = await buildPersonalDataExport({ developerAccountId: "dev-acc-1", email: "dev@example.com" });

    expect(pkg.version).toBe(1);
    expect(pkg.subject).toEqual({ developerAccountId: "dev-acc-1", email: "dev@example.com" });
    expect(pkg.account).toMatchObject({ id: "dev-acc-1", email: "dev@example.com", displayName: "Dev Jane" });
    expect(pkg.account).not.toHaveProperty("passwordHash");
    expect(pkg.identities).toHaveLength(1);
    expect(pkg.apiAccess?.requests).toHaveLength(1);
    expect(pkg.apiAccess?.clients[0]).toMatchObject({ id: "client-1" });
    expect(pkg.apiAccess?.clients[0]?.tokens[0]).toMatchObject({ tokenPrefix: "mc_abc" });
    expect(pkg.formSubmissions).toEqual([SUBMISSION]);
    expect(repos.adminRepo.listFormSubmissionsBySubject).toHaveBeenCalledWith({
      developerAccountId: "dev-acc-1",
      email: "dev@example.com",
    });
  });

  it("omits the account sections for an account-less subject", async () => {
    const pkg = await buildPersonalDataExport({ email: "person@example.com" });

    expect(pkg.account).toBeUndefined();
    expect(pkg.identities).toBeUndefined();
    expect(pkg.apiAccess).toBeUndefined();
    expect(pkg.formSubmissions).toEqual([SUBMISSION]);
    expect(repos.developerRepo.findDeveloperAccountById).not.toHaveBeenCalled();
  });

  it("returns empty collections when nothing is stored for the subject", async () => {
    repos.adminRepo.listFormSubmissionsBySubject.mockResolvedValueOnce([]);
    const pkg = await buildPersonalDataExport({ email: "nobody@example.com" });

    expect(pkg.formSubmissions).toEqual([]);
  });
});
