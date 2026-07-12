import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ButtonVariant, buttonVariantClass } from "../lib/buttonVariant";
import { SurfaceCard } from "./SurfaceCard";

describe("shared Developer UI primitives", () => {
  it("provides a documented SurfaceCard compound component", () => {
    const html = renderToStaticMarkup(
      <SurfaceCard>
        <SurfaceCard.Header>Title</SurfaceCard.Header>
        <SurfaceCard.Body>Body</SurfaceCard.Body>
        <SurfaceCard.Footer>Footer</SurfaceCard.Footer>
      </SurfaceCard>,
    );

    expect(html).toContain('<article class="surface-card">');
    expect(html).toContain('<header class="surface-card__header">Title</header>');
    expect(html).toContain('<div class="surface-card__body">Body</div>');
    expect(html).toContain('<footer class="surface-card__footer">Footer</footer>');
  });

  it("defines every shared button modifier in the variant domain", () => {
    expect(Object.values(ButtonVariant).map(buttonVariantClass)).toEqual([
      "button--primary",
      "button--secondary",
      "button--content",
      "button--subtle",
      "button--icon",
      "button--danger",
    ]);
  });
});
