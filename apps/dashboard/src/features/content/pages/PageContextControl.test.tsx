import { ContentContext } from "@musiccloud/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PageContextControl } from "@/features/content/pages/PageContextControl";

describe("PageContextControl", () => {
  it("protects the final active context bit", () => {
    const onChange = vi.fn();
    render(<PageContextControl value={ContentContext.Frontend} onChange={onChange} />);

    const frontend = screen.getByRole("checkbox", { name: "Frontend" }) as HTMLInputElement;
    const developerPortal = screen.getByRole("checkbox", { name: "Developer Portal" }) as HTMLInputElement;
    expect(frontend.checked).toBe(true);
    expect(frontend.disabled).toBe(true);
    expect(developerPortal.checked).toBe(false);

    fireEvent.click(screen.getByRole("checkbox", { name: "Developer Portal" }));
    expect(onChange).toHaveBeenCalledWith(ContentContext.Frontend | ContentContext.DeveloperPortal);
  });

  it("exposes navigation dependency feedback through its compound API", () => {
    render(
      <PageContextControl.Root
        value={ContentContext.Frontend | ContentContext.DeveloperPortal}
        blockedContextMask={ContentContext.DeveloperPortal}
        validationMessage="Remove this page from Developer Portal navigation first."
        onChange={vi.fn()}
      />,
    );

    const developerPortal = screen.getByRole("checkbox", { name: "Developer Portal" }) as HTMLInputElement;
    expect(developerPortal.disabled).toBe(true);
    expect(screen.getByText("Remove this page from Developer Portal navigation first.")).toBeTruthy();
  });
});
