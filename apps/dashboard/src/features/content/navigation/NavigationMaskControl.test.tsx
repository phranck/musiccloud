import { ContentContext, NavigationArea } from "@musiccloud/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NavigationMaskControl } from "@/features/content/navigation/NavigationMaskControl";
import { NavigationMaskKind } from "@/features/content/navigation/navigation.constants";

describe("NavigationMaskControl", () => {
  it("protects the final active context bit", () => {
    const onChange = vi.fn();
    render(
      <NavigationMaskControl kind={NavigationMaskKind.Context} value={ContentContext.Frontend} onChange={onChange} />,
    );

    const frontend = screen.getByRole("checkbox", { name: "Frontend" }) as HTMLInputElement;
    const developerPortal = screen.getByRole("checkbox", { name: "Developer Portal" }) as HTMLInputElement;

    expect(frontend.checked).toBe(true);
    expect(frontend.disabled).toBe(true);
    expect(developerPortal.checked).toBe(false);

    fireEvent.click(developerPortal);
    expect(onChange).toHaveBeenCalledWith(ContentContext.Frontend | ContentContext.DeveloperPortal);
  });

  it("protects the final active area bit while allowing either area to be removed from both", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NavigationMaskControl
        kind={NavigationMaskKind.Area}
        value={NavigationArea.Main | NavigationArea.Footer}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Main" }));
    expect(onChange).toHaveBeenCalledWith(NavigationArea.Footer);

    rerender(
      <NavigationMaskControl kind={NavigationMaskKind.Area} value={NavigationArea.Footer} onChange={onChange} />,
    );

    expect((screen.getByRole("checkbox", { name: "Footer" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Main" }));
    expect(onChange).toHaveBeenLastCalledWith(NavigationArea.Main | NavigationArea.Footer);
  });

  it("supports fixed system-owned bits without changing the mask", () => {
    const onChange = vi.fn();
    render(
      <NavigationMaskControl
        disabledMask={ContentContext.Frontend | ContentContext.DeveloperPortal}
        kind={NavigationMaskKind.Context}
        value={ContentContext.DeveloperPortal}
        onChange={onChange}
      />,
    );

    expect((screen.getByRole("checkbox", { name: "Frontend" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Developer Portal" }) as HTMLInputElement).disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
