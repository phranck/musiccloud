/**
 * @file Service tests for GDPR erasure (MC-085, Art. 17): authenticated
 * developer accounts are deleted and their dependent records are cleared by
 * database cascades. The developer repository is stubbed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDeveloperRepository } from "../../db/index.js";
import { erasePersonalData } from "../gdpr-erase.js";

vi.mock("../../db/index.js", () => ({
  getDeveloperRepository: vi.fn(),
}));

const developerRepo = {
  deleteDeveloperAccount: vi.fn(async () => true),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDeveloperRepository).mockResolvedValue(developerRepo as never);
});

describe("erasePersonalData", () => {
  it("deletes the explicitly identified developer account", async () => {
    const result = await erasePersonalData("dev-acc-1");

    expect(developerRepo.deleteDeveloperAccount).toHaveBeenCalledWith("dev-acc-1");
    expect(result).toEqual({ accountDeleted: true });
  });

  it("reports when the identified developer account no longer exists", async () => {
    developerRepo.deleteDeveloperAccount.mockResolvedValueOnce(false);
    const result = await erasePersonalData("missing-account");

    expect(developerRepo.deleteDeveloperAccount).toHaveBeenCalledWith("missing-account");
    expect(result).toEqual({ accountDeleted: false });
  });
});
