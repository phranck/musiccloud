import type { ApiErrorResponse } from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShareErrorShell } from "./ShareErrorShell";

const error: ApiErrorResponse = {
  error: "MC-DB-0001",
  errorId: "1bc8fa27-a606-44c4-b8a5-1f2067e41246",
  message: "The database permissions are invalid for this operation. (MC-DB-0001)",
};

const labels = {
  back: "Back to musiccloud",
  code: "Error code",
  copied: "Copied",
  copy: "Copy error details",
  description: "Please report the following details.",
  reference: "Reference",
  title: "The page could not be loaded",
};

describe("ShareErrorShell", () => {
  it("shows the backend message, stable code, and incident reference", () => {
    render(<ShareErrorShell error={error} labels={labels} />);

    expect(screen.getByRole("heading", { name: labels.title })).toBeInTheDocument();
    expect(screen.getByText(error.message)).toBeInTheDocument();
    expect(screen.getByText(error.error)).toBeInTheDocument();
    expect(screen.getByText(error.errorId)).toBeInTheDocument();
  });

  it("copies all reportable error details", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ShareErrorShell error={error} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: labels.copy }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${error.error}\n${error.errorId}\n${error.message}`));
    expect(screen.getByText(labels.copied)).toBeInTheDocument();
  });
});
