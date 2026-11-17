import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENDPOINTS,
  type PublicSponsor,
  SPONSOR_WALL_ATTRIBUTE,
  SPONSOR_WALL_DEFAULTS,
  type SponsorsPayload,
  SUPPORT_LADDER_ATTRIBUTE,
  SupportIntervalKey,
} from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";

/** The day every case is counted against: 2026-11-17, noon UTC. */
const NOW = new Date(Date.UTC(2026, 10, 17, 12));

/** A sponsor who paid ten days before {@link NOW}, so 355 days are left. */
const ADA: PublicSponsor = {
  id: "s1",
  name: "Ada",
  socialMedia: [{ platform: "mastodon", url: "https://chaos.social/@ada" }],
  avatarId: "a".repeat(64),
  claim: "Music for everybody.",
  paidOn: "2026-11-07",
};

/**
 * The public route's answer.
 *
 * @param sponsors - Who is on the wall.
 * @param coveredCents - What came in over the year, against costs of €620.
 * @returns The payload.
 */
function payload(sponsors: PublicSponsor[], coveredCents = 31_000): SponsorsPayload {
  return { sponsors, costsTotalCents: 62_000, coveredCents, donatedMonthCents: 0, minAmountCents: 4_000 };
}

/**
 * A marker as it stands in a page, with the attribute escaped the way the backend escapes it.
 *
 * @param attribute - The marker's attribute.
 * @param value - The attribute's value before escaping.
 * @returns The marker element.
 */
function marker(attribute: string, value: object): string {
  const escaped = JSON.stringify(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<div ${attribute}="${escaped}"></div>`;
}

/** The wall's marker with every text left to the site's defaults. */
const WALL = marker(SPONSOR_WALL_ATTRIBUTE, { text: "", covered: "", missing: "", empty: "", emptyAction: "" });

const fetchMock = vi.fn();

/**
 * Answers the wall's request with a payload.
 *
 * @param body - The payload.
 */
function answer(body: SponsorsPayload): void {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SponsorWall", () => {
  it("reads the sponsors from the site's own origin and shows each with picture and days left", async () => {
    answer(payload([ADA]));
    render(<MarkdownHtml html={WALL} />);

    expect(await screen.findByText("Ada")).toBeTruthy();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(ENDPOINTS.frontend.sponsors);
    expect(screen.getByText("355 days left")).toBeTruthy();
    expect(screen.getByText("7 November 2026")).toBeTruthy();
    expect(screen.getByText("Music for everybody.")).toBeTruthy();
    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      ENDPOINTS.frontend.sponsorAvatar(ADA.avatarId ?? ""),
    );
    expect(screen.getByRole("link", { name: "Mastodon" }).getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("€310 to go until this year's running costs are covered.")).toBeTruthy();
  });

  it("stands still with up to two cards and shows each once", async () => {
    answer(payload([ADA, { ...ADA, id: "s2", name: "Grace", avatarId: null }]));
    render(<MarkdownHtml html={WALL} />);

    await screen.findByText("Grace");
    expect(document.querySelector(".mc-sponsor-wall__rail.is-moving")).toBeNull();
    expect(screen.getAllByText("Ada")).toHaveLength(1);
    // A sponsor without a picture is shown by their initial.
    expect(screen.getByText("G")).toBeTruthy();
  });

  it("moves from the third card on, with a copy of the row kept out of reading and tab order", async () => {
    const sponsors = ["Ada", "Grace", "Linus"].map((name, index) => ({ ...ADA, id: `s${index}`, name }));
    answer(payload(sponsors, 70_000));
    render(<MarkdownHtml html={WALL} />);

    await screen.findAllByText("Linus");
    expect(document.querySelector(".mc-sponsor-wall__rail.is-moving")).not.toBeNull();
    const copies = document.querySelectorAll('li[aria-hidden="true"]');
    expect(copies).toHaveLength(3);
    for (const copy of copies) expect(copy.hasAttribute("inert")).toBe(true);
    expect(screen.getByText("This year's running costs are covered.", { exact: false })).toBeTruthy();
  });

  it("invites the first sponsor with nobody on the wall, and its button opens the ladder's sponsor tab", async () => {
    answer(payload([]));
    const ladder = marker(SUPPORT_LADDER_ATTRIBUTE, {
      intervals: [
        {
          key: SupportIntervalKey.Once,
          label: "Once",
          text: "",
          hint: "",
          belowMinimum: "",
          options: [{ amountEur: 5, description: "", recommended: true }],
          custom: null,
        },
        {
          key: SupportIntervalKey.Sponsor,
          label: "Sponsor",
          text: "",
          hint: "",
          belowMinimum: "",
          options: [],
          custom: { label: "Your amount", placeholder: "", text: "" },
        },
      ],
      bankAccount: null,
      routes: [],
      payee: { name: "", iban: "", bic: "" },
      minSponsorAmountEur: 40,
      labels: {},
    });
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(<MarkdownHtml html={`${WALL}${ladder}`} />);

    const invite = await screen.findByRole("button", { name: SPONSOR_WALL_DEFAULTS.emptyAction });
    expect(screen.getByText("This place is yours.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sponsor" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(invite);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sponsor" }).getAttribute("aria-pressed")).toBe("true"),
    );
    expect(scrolled).toHaveBeenCalled();
  });

  it("shows nothing when the sponsors cannot be read", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    const { container } = render(<MarkdownHtml html={WALL} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector(".mc-sponsor-wall")).toBeNull();
  });

  it("stands still for a reader who prefers reduced motion, and can be scrolled by hand", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");
    const reduced = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .mc-sponsor-wall__rail.is-moving"),
    );

    expect(reduced).toMatch(
      /^@media \(prefers-reduced-motion: reduce\) \{\s+\.mc-sponsor-wall__rail\.is-moving \.mc-sponsor-wall__track \{\s+animation: none;/,
    );
    expect(reduced).toMatch(/\.mc-sponsor-wall__rail \{\s+overflow-x: auto;/);
  });
});
