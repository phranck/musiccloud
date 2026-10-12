import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminListSearchField } from "@/features/music/AdminListSearchField";

describe("AdminListSearchField", () => {
  it("is named by its placeholder and reports every change", () => {
    const onChange = vi.fn();
    render(<AdminListSearchField value="" onChange={onChange} placeholder="Search tracks…" />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search tracks…" }), { target: { value: "slow" } });

    expect(onChange).toHaveBeenCalledWith("slow");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("offers a clear button once there is text, which sends the empty text", () => {
    const onChange = vi.fn();
    render(<AdminListSearchField value="slow" onChange={onChange} placeholder="Search tracks…" />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
