import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarMenu } from "./AvatarMenu";

describe("AvatarMenu", () => {
  it("separates the canonical touch target from the compact avatar visual", () => {
    const html = renderToStaticMarkup(
      <AvatarMenu account={{ email: "visual.qa@example.test", displayName: "Visual QA", avatarUrl: null }} />,
    );

    expect(html).toContain('class="avatar-menu__trigger"');
    expect(html).toContain('class="avatar-menu__visual"');
  });
});
