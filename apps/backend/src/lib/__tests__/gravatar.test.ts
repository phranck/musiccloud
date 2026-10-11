import { describe, expect, it } from "vitest";
import { isGravatarAddress } from "../gravatar.js";

describe("isGravatarAddress", () => {
  it.each([
    ["the address the dashboard and the direct lookup build", "https://www.gravatar.com/avatar/abc?s=256&d=mp"],
    ["a numbered host, as a profile answers with", "https://2.gravatar.com/avatar/abc123"],
    ["the bare host", "https://gravatar.com/avatar/abc"],
  ])("accepts %s", (_label, value) => {
    expect(isGravatarAddress(value)).toBe(true);
  });

  it.each([
    ["plain http", "http://www.gravatar.com/avatar/abc"],
    ["another host", "https://evil.example/avatar/abc"],
    ["a host that only starts like Gravatar's", "https://www.gravatar.com.evil.example/avatar/abc"],
    ["credentials in front of another host", "https://www.gravatar.com@evil.example/avatar/abc"],
    ["a port", "https://www.gravatar.com:8443/avatar/abc"],
    ["something that is not a URL", "not a url"],
    ["a value that is not a string", 42],
  ])("refuses %s", (_label, value) => {
    expect(isGravatarAddress(value)).toBe(false);
  });
});
