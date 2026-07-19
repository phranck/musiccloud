import { ContentContext } from "@musiccloud/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreatePageDialog } from "@/features/content/pages/CreatePageDialog";

const mutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock("@/features/content/hooks/useAdminContent", () => ({
  useCreateContentPage: () => mutation,
}));

describe("CreatePageDialog", () => {
  beforeEach(() => {
    mutation.mutateAsync.mockReset();
  });

  it("creates one draft publication for every selected context", async () => {
    mutation.mutateAsync.mockResolvedValue({ slug: "privacy" });
    render(<CreatePageDialog open onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Privacy" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Developer Portal" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(mutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "privacy",
        contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
        publications: [
          {
            context: ContentContext.Frontend,
            path: "/privacy",
            status: "draft",
            templateKey: "frontend-default",
          },
          {
            context: ContentContext.DeveloperPortal,
            path: "/privacy",
            status: "draft",
            templateKey: "developer-default",
          },
        ],
      }),
    );
  });

  it("keeps a Developer Portal /docs draft visible but prevents submission", () => {
    render(<CreatePageDialog open onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Docs" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Developer Portal" }));

    const createButton = screen.getByRole("button", { name: "Create" }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
    expect(screen.getByText("The complete /docs namespace is system-owned.")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Slug" })).toHaveProperty("value", "docs");
  });
});
