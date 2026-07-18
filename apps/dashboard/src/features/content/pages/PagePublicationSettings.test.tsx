import { ContentContext } from "@musiccloud/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PagePublicationSettings } from "@/features/content/pages/PagePublicationSettings";

describe("PagePublicationSettings", () => {
  it("edits the route independently for one context", () => {
    const onChange = vi.fn();
    render(
      <PagePublicationSettings
        publication={{
          context: ContentContext.DeveloperPortal,
          path: "/privacy",
          status: "draft",
          templateKey: "developer-default",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Path" }), { target: { value: "/legal/privacy" } });
    expect(onChange).toHaveBeenCalledWith({ path: "/legal/privacy" });
    expect(screen.getByText("Developer Portal publication")).toBeTruthy();
  });

  it("blocks the published state when Markdown is invalid for an enabled context", () => {
    render(
      <PagePublicationSettings
        publication={{
          context: ContentContext.Frontend,
          path: "/privacy",
          status: "draft",
          templateKey: "frontend-default",
        }}
        markdownValid={false}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Status" }));
    expect(screen.queryByText("Published")).toBeNull();
    expect(screen.getByText("Fix cross-context Markdown errors before publishing.")).toBeTruthy();
  });

  it("keeps an existing published value visible when Markdown later becomes invalid", () => {
    render(
      <PagePublicationSettings
        publication={{
          context: ContentContext.Frontend,
          path: "/privacy",
          status: "published",
          templateKey: "frontend-default",
        }}
        markdownValid={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Status" }).textContent).toContain("Published");
  });

  it("flags the system-owned Docs namespace without rewriting the draft", () => {
    render(
      <PagePublicationSettings
        publication={{
          context: ContentContext.DeveloperPortal,
          path: "/docs/authentication",
          status: "draft",
          templateKey: "developer-default",
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Path" })).toHaveProperty("value", "/docs/authentication");
    expect(screen.getByText("The complete /docs namespace is system-owned.")).toBeTruthy();
  });
});
