import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmbossedCard } from "./EmbossedCard";

describe("EmbossedCard material and clipping boundaries", () => {
  it("keeps the empty shadow plate outside the surface that clips compound content", () => {
    const { container } = render(
      <EmbossedCard>
        <EmbossedCard.Header>Header</EmbossedCard.Header>
        <EmbossedCard.Body>Body</EmbossedCard.Body>
        <EmbossedCard.Footer>Footer</EmbossedCard.Footer>
      </EmbossedCard>,
    );
    const card = container.querySelector(".mc-glass-card");
    const plate = card?.querySelector(":scope > .mc-card-shadow");
    const content = card?.querySelector(":scope > .mc-card-content");

    expect(plate).toHaveAttribute("aria-hidden", "true");
    expect(plate?.childElementCount).toBe(0);
    expect(content).not.toContainElement(plate instanceof HTMLElement ? plate : null);
    expect(content).toContainElement(screen.getByText("Header"));
    expect(content).toContainElement(screen.getByText("Body"));
    expect(content).toContainElement(screen.getByText("Footer"));
  });

  it("derives the content clipping radius from the outer radius and authored padding", () => {
    const { container } = render(
      <EmbossedCard radius="40px" padding="12px">
        Content
      </EmbossedCard>,
    );
    const card = container.querySelector<HTMLElement>(".mc-glass-card");

    expect(card?.style.getPropertyValue("--emb-radius-base")).toBe("40px");
    expect(card?.style.getPropertyValue("--mc-card-clip-radius")).toBe("max(0px, calc(var(--emb-radius) - 12px))");
  });

  it("keeps zero-padding and explicit overflow-visible cards on the same surface boundary", () => {
    const { container } = render(
      <EmbossedCard className="p-0 overflow-visible flex flex-col h-full">
        <EmbossedCard.Body className="flex-1 min-h-0">Body</EmbossedCard.Body>
      </EmbossedCard>,
    );
    const card = container.querySelector<HTMLElement>(".mc-glass-card");

    expect(card).toHaveClass("overflow-visible", "flex", "flex-col", "h-full");
    expect(card?.style.getPropertyValue("--mc-card-clip-radius")).toBe("max(0px, calc(var(--emb-radius) - 0px))");
    expect(card?.querySelector(":scope > .mc-card-content")).toContainElement(screen.getByText("Body"));
  });
});
