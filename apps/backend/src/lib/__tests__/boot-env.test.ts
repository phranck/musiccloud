import { afterEach, describe, expect, it } from "vitest";
import { assertRequiredBootEnv } from "../boot-env.js";

describe("assertRequiredBootEnv", () => {
  const original = process.env.JAMENDO_CLIENT_ID;

  afterEach(() => {
    if (original === undefined) delete process.env.JAMENDO_CLIENT_ID;
    else process.env.JAMENDO_CLIENT_ID = original;
  });

  it("passes when JAMENDO_CLIENT_ID is set", () => {
    process.env.JAMENDO_CLIENT_ID = "test-client-id";
    expect(() => assertRequiredBootEnv()).not.toThrow();
  });

  it("throws and names the variable when JAMENDO_CLIENT_ID is missing", () => {
    delete process.env.JAMENDO_CLIENT_ID;
    expect(() => assertRequiredBootEnv()).toThrow(/JAMENDO_CLIENT_ID/);
  });

  it("treats an empty JAMENDO_CLIENT_ID as missing", () => {
    process.env.JAMENDO_CLIENT_ID = "";
    expect(() => assertRequiredBootEnv()).toThrow(/JAMENDO_CLIENT_ID/);
  });
});
