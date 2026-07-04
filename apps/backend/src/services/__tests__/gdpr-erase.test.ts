/**
 * @file Service tests for GDPR erasure (MC-085, Art. 17): submissions are
 * anonymised for every subject; account subjects additionally get their
 * developer account deleted (the DB cascade then clears identities, email
 * tokens, API-access requests/clients). Repositories are stubbed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminRepository, getDeveloperRepository } from "../../db/index.js";
import { erasePersonalData } from "../gdpr-erase.js";

vi.mock("../../db/index.js", () => ({
  getAdminRepository: vi.fn(),
  getDeveloperRepository: vi.fn(),
}));

const adminRepo = {
  anonymizeFormSubmissionsBySubject: vi.fn(async () => ({ anonymized: 2 })),
};
const developerRepo = {
  deleteDeveloperAccount: vi.fn(async () => true),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdminRepository).mockResolvedValue(adminRepo as never);
  vi.mocked(getDeveloperRepository).mockResolvedValue(developerRepo as never);
});

describe("erasePersonalData", () => {
  it("anonymises submissions and deletes the account for an account subject", async () => {
    const result = await erasePersonalData({ developerAccountId: "dev-acc-1", email: "dev@example.com" });

    expect(adminRepo.anonymizeFormSubmissionsBySubject).toHaveBeenCalledWith({
      developerAccountId: "dev-acc-1",
      email: "dev@example.com",
    });
    expect(developerRepo.deleteDeveloperAccount).toHaveBeenCalledWith("dev-acc-1");
    expect(result).toEqual({ anonymizedSubmissions: 2, accountDeleted: true });
  });

  it("only anonymises submissions for an account-less subject", async () => {
    const result = await erasePersonalData({ email: "person@example.com" });

    expect(adminRepo.anonymizeFormSubmissionsBySubject).toHaveBeenCalledWith({ email: "person@example.com" });
    expect(developerRepo.deleteDeveloperAccount).not.toHaveBeenCalled();
    expect(result).toEqual({ anonymizedSubmissions: 2, accountDeleted: false });
  });
});
