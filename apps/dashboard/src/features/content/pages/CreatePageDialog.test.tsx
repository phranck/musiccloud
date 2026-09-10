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

  it("lets a Developer Portal page take /docs itself, which is editable copy", () => {
    render(<CreatePageDialog open onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Docs" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Developer Portal" }));

    const createButton = screen.getByRole("button", { name: "Create" }) as HTMLButtonElement;
    expect(createButton.disabled).toBe(false);
    expect(screen.getByRole("textbox", { name: "Slug" })).toHaveProperty("value", "docs");
  });

  it("keeps a Developer Portal draft out of the namespace below /docs", () => {
    // Everything under `/docs` is the API reference and the search, which the
    // portal builds. Only the landing page is copy.
    render(<CreatePageDialog open onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Docs guide" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Slug" }), { target: { value: "docs/guide" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Developer Portal" }));

    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
