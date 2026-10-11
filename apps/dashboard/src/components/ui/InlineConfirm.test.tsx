import { DashboardActionId } from "@musiccloud/dashboard-ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { dashboardCopy } from "@/copy/dashboard";
import { InlineConfirm } from "./InlineConfirm";

function renderConfirm(disabled = false) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <InlineConfirm
      message="This removes the offer."
      confirmAction={DashboardActionId.Delete}
      confirmLabel="Remove offer"
      onConfirm={onConfirm}
      onCancel={onCancel}
      disabled={disabled}
    />,
  );
  return { onConfirm, onCancel };
}

describe("InlineConfirm", () => {
  it("states what confirming does", () => {
    renderConfirm();

    expect(screen.getByText("This removes the offer.")).not.toBeNull();
  });

  it("calls onCancel from Cancel and onConfirm from the confirming button", async () => {
    const { onConfirm, onCancel } = renderConfirm();

    await userEvent.click(screen.getByRole("button", { name: dashboardCopy.common.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Remove offer" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables only the confirming button, so Cancel still works", async () => {
    const { onCancel } = renderConfirm(true);

    expect((screen.getByRole("button", { name: "Remove offer" }) as HTMLButtonElement).disabled).toBe(true);
    const cancel = screen.getByRole("button", { name: dashboardCopy.common.cancel }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(false);
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
