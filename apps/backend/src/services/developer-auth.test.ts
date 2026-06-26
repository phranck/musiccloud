import { describe, expect, it } from "vitest";
import { generateEmailToken, hashEmailToken, hashPassword, verifyPassword } from "./developer-auth.js";

describe("developer-auth password hashing", () => {
  it("hashes a password into a bcrypt string that verifies against the original", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).not.toBe("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password against a real hash", async () => {
    const hash = await hashPassword("the-right-one");

    await expect(verifyPassword("the-wrong-one", hash)).resolves.toBe(false);
  });

  it("always returns false (timing-safe) when no hash exists", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
  });
});

describe("developer-auth email tokens", () => {
  it("generates a raw token distinct from its hash", () => {
    const { raw, hash } = generateEmailToken();

    expect(raw).toBeTruthy();
    expect(hash).toBeTruthy();
    expect(raw).not.toBe(hash);
  });

  it("derives a hash that matches hashEmailToken(raw)", () => {
    const { raw, hash } = generateEmailToken();

    expect(hashEmailToken(raw)).toBe(hash);
  });

  it("hashes deterministically (same raw → same hash)", () => {
    const { raw } = generateEmailToken();

    expect(hashEmailToken(raw)).toBe(hashEmailToken(raw));
  });

  it("produces unique raw tokens across calls", () => {
    const a = generateEmailToken();
    const b = generateEmailToken();

    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});
