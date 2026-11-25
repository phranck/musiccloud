import { describe, expect, it } from "vitest";

import { formatJson } from "./formatJson";

describe("formatJson", () => {
  it("puts each value on a line of its own, indented by two spaces per level", () => {
    expect(formatJson('{"glass":{"card":{"shadow":0.4}},"on":true}')).toBe(
      '{\n  "glass": {\n    "card": {\n      "shadow": 0.4\n    }\n  },\n  "on": true\n}',
    );
  });

  it("leaves formatted JSON as it is", () => {
    const formatted = '{\n  "a": [\n    1,\n    2\n  ]\n}';
    expect(formatJson(formatted)).toBe(formatted);
  });

  it("keeps an empty field empty", () => {
    expect(formatJson("  \n")).toBe("");
  });

  it("answers null for text that is not JSON", () => {
    expect(formatJson('{"a": 1,}')).toBeNull();
  });
});
