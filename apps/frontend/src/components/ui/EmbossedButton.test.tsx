import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmbossedButton } from "@/components/ui/EmbossedButton";

/**
 * Result lists, genre grids and track rows mount dozens of {@link EmbossedButton}s
 * at once. A GPU layer for each costs Safari several long frames as such a list
 * appears, so the button must not request one.
 */
describe("EmbossedButton", () => {
  it("does not request a GPU layer of its own", () => {
    const { getByRole } = render(
      <EmbossedButton as="button" type="button">
        Play
      </EmbossedButton>,
    );

    expect(getByRole("button").className).not.toMatch(/transform-gpu|will-change/);
  });
});
