import { existsSync } from "node:fs";
import path from "node:path";
import { PLATFORM_ICON_FILES, PlatformIcon } from "@musiccloud/dashboard-ui/platform-icon";
import { Service, type ServiceId } from "@musiccloud/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const SERVICES = Object.values(Service) as ServiceId[];

describe("PlatformIcon", () => {
  it.each(
    SERVICES.flatMap((service) => [[service, true] as const, [service, false] as const]),
  )("draws a mark for %s with colored %s", (service, colored) => {
    const { container } = render(<PlatformIcon platform={service} colored={colored} />);

    expect(container.firstElementChild).not.toBeNull();
  });
});

/**
 * The icon addresses its image files root-relative, so each app that renders it
 * serves them from its own `public/icons`.
 */
describe("platform icon files", () => {
  // Vitest runs from the dashboard's package folder.
  const ICON_FOLDERS = {
    dashboard: path.join(process.cwd(), "public/icons"),
    site: path.join(process.cwd(), "../frontend/public/icons"),
  };

  it.each(Object.entries(ICON_FOLDERS))("are all served by the %s", (_app, folder) => {
    const missing = Object.values(PLATFORM_ICON_FILES).filter((file) => !existsSync(path.join(folder, file)));

    expect(missing).toEqual([]);
  });
});
