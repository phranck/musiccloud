import {
  SPONSOR_FORM_DEFAULTS,
  SUPPORT_LADDER_ATTRIBUTE,
  SUPPORT_LADDER_LABEL_DEFAULTS,
  SupportIntervalKey,
  SupportRouteToken,
} from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";

/** Every code the stand-in renderer was asked to draw, newest last. */
const drawn = vi.hoisted(() => [] as string[]);

// The real renderer draws into a canvas jsdom does not have. The stand-in keeps
// what it was asked to encode, which is what the ladder decides.
vi.mock("qr-code-styling", () => ({
  default: class {
    constructor(options: { data: string }) {
      drawn.push(options.data);
    }
    getRawData() {
      return Promise.resolve(new Blob(["<svg xmlns='http://www.w3.org/2000/svg'/>"], { type: "image/svg+xml" }));
    }
  },
}));

const PAYEE = { name: "musiccloud", iban: "DE89370400440532013000", bic: "COBADEFFXXX" };
const PURPOSE_DONATION = "Donation musiccloud.io";
const PURPOSE_SPONSOR = "Sponsorship musiccloud.io";
const MINIMUM = 50;

/** The single payment's transfer card, which a tab naming none of its own borrows. */
const ONCE_VARIANT = { key: SupportIntervalKey.Once, title: "Bank transfer", text: "", recommended: true, info: "" };

/** The sponsor tab's transfer card, holding a form that names no words of its own. */
const SPONSOR_VARIANT = {
  key: SupportIntervalKey.Sponsor,
  title: "Bank transfer",
  text: "",
  recommended: false,
  info: "",
  sponsorForm: {},
};

/** The configuration the backend writes for a page with all three tabs. */
const LADDER = {
  intervals: [
    {
      key: SupportIntervalKey.Once,
      label: "Once",
      text: "",
      hint: "",
      belowMinimum: "",
      options: [
        { amountEur: 5, description: "<p>A coffee</p>", recommended: false },
        { amountEur: 10, description: "<p>A month of hosting</p>", recommended: true },
      ],
      custom: { label: "Another amount", placeholder: "15", text: "" },
    },
    {
      key: SupportIntervalKey.Monthly,
      label: "Monthly",
      text: "<p>That is {annualAmount} a year.</p>",
      hint: "",
      belowMinimum: "",
      options: [
        { amountEur: 3, description: "", recommended: false },
        { amountEur: 10, description: "", recommended: true },
      ],
      custom: null,
    },
    {
      key: SupportIntervalKey.Sponsor,
      label: "Sponsor",
      text: "",
      hint: "<p>Sponsors pay by transfer.</p>",
      belowMinimum: "<p>Below {min} this is a donation.</p>",
      options: [],
      custom: { label: "Your sponsorship", placeholder: "", text: "" },
    },
  ],
  bankAccount: {
    purposeDonation: PURPOSE_DONATION,
    purposeSponsor: PURPOSE_SPONSOR,
    variants: [ONCE_VARIANT, SPONSOR_VARIANT],
  },
  routes: [
    {
      token: SupportRouteToken.PaypalMe,
      url: "https://paypal.me/musiccloud",
      title: "PayPal",
      text: "",
      hint: "",
      button: "Open PayPal",
    },
    {
      token: SupportRouteToken.GithubSponsors,
      url: "https://github.com/sponsors/musiccloud",
      title: "GitHub Sponsors",
      text: "",
      hint: "",
      button: "Open GitHub Sponsors",
    },
  ],
  payee: PAYEE,
  minSponsorAmountEur: MINIMUM,
  labels: {},
};

/** The same page with no form under the sponsor tab, so its transfer borrows the single payment's card. */
const LADDER_WITHOUT_FORM = { ...LADDER, bankAccount: { ...LADDER.bankAccount, variants: [ONCE_VARIANT] } };

/**
 * The marker as it stands in a page's HTML, with the attribute escaped the way
 * the backend escapes it.
 *
 * @param value - The attribute's value before escaping.
 * @returns The marker element.
 */
function marker(value: string): string {
  const escaped = value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<div ${SUPPORT_LADDER_ATTRIBUTE}="${escaped}"></div>`;
}

/** Renders a page body holding the ladder. */
function renderLadder(config: object = LADDER) {
  return render(<MarkdownHtml html={marker(JSON.stringify(config))} />);
}

/** The transfer card's line for one label. */
function line(label: string): string {
  const term = screen.getByText(label, { selector: "dt" });
  return term.nextElementSibling?.textContent ?? "";
}

/** The class of the element that holds a tab's blocks, one after another. */
const LADDER_BODY_SELECTOR = ".mc-support-ladder__body";

/**
 * The block of the ladder's body that holds an element, which is the card or
 * the grid it stands in.
 *
 * @param container - What the ladder was rendered into.
 * @param element - An element inside the body.
 * @returns The body's child that contains it.
 */
function blockHolding(container: HTMLElement, element: Element): Element {
  const body = container.querySelector(LADDER_BODY_SELECTOR);
  const block = [...(body?.children ?? [])].find((child) => child.contains(element));
  if (!block) throw new Error("The element stands in no block of the ladder's body.");
  return block;
}

/** Chooses a tab and waits for its body to replace the old one. */
async function chooseTab(name: string, expectWhenShown: () => void) {
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(expectWhenShown);
}

beforeEach(() => {
  drawn.length = 0;
});

describe("SupportLadder", () => {
  it("mounts on the marker, with a switch that says which tab is chosen", () => {
    renderLadder();

    expect(screen.getByRole("button", { name: "Once" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Monthly" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("renders nothing for a marker that does not hold a ladder", () => {
    const { container } = render(<MarkdownHtml html={marker('{"intervals":[]}')} />);

    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector(`[${SUPPORT_LADDER_ATTRIBUTE}]`)).toBeNull();
  });

  it("opens on the recommended amount and encodes it in the GiroCode", async () => {
    renderLadder();

    expect(screen.getByRole("button", { name: /€10/ }).getAttribute("aria-pressed")).toBe("true");
    expect(line("Purpose")).toBe(PURPOSE_DONATION);
    await waitFor(() => expect(drawn.at(-1)).toContain("EUR10.00"));
    expect(drawn.at(-1)).toContain(PAYEE.iban);
    expect(await screen.findByRole("img", { name: "GiroCode to scan with a banking app" })).toBeTruthy();
  });

  it("carries a chosen amount into the transfer and the code", async () => {
    renderLadder();

    fireEvent.click(screen.getByRole("button", { name: /€5/ }));

    expect(line("Amount")).toBe("€5");
    await waitFor(() => expect(drawn.at(-1)).toContain("EUR5.00"));
  });

  it("shows PayPal.Me and GitHub Sponsors under the single payment", () => {
    renderLadder();

    expect(screen.getByRole("link", { name: /Open PayPal/ }).getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByRole("link", { name: /Open GitHub Sponsors/ })).toBeTruthy();
  });

  it("drops the code and PayPal.Me on the monthly tab and names the yearly total", async () => {
    renderLadder();

    await chooseTab("Monthly", () => expect(screen.getByText("That is €120 a year.")).toBeTruthy());

    expect(screen.queryByRole("img", { name: "GiroCode to scan with a banking app" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open PayPal/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Open GitHub Sponsors/ })).toBeTruthy();
    expect(line("Amount")).toBe("€10 a month");
  });

  it("opens the sponsor tab on the minimum, by transfer alone and with the sponsor purpose", async () => {
    renderLadder();

    await chooseTab("Sponsor", () =>
      expect((screen.getByLabelText("Your sponsorship") as HTMLInputElement).value).toBe(String(MINIMUM)),
    );

    expect(line("Purpose")).toBe(PURPOSE_SPONSOR);
    expect(screen.queryByRole("link", { name: /Open PayPal/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open GitHub Sponsors/ })).toBeNull();
  });

  it("never names a sponsorship on a sponsor tab without a form, at or above the minimum", async () => {
    renderLadder(LADDER_WITHOUT_FORM);

    await chooseTab("Sponsor", () =>
      expect((screen.getByLabelText("Your sponsorship") as HTMLInputElement).value).toBe(String(MINIMUM)),
    );

    expect(line("Purpose")).toBe(PURPOSE_DONATION);
    expect(screen.queryByText(SUPPORT_LADDER_LABEL_DEFAULTS.fieldReference, { selector: "dt" })).toBeNull();
  });

  it("stands the amount, the form and the notice in one card, in the order the errand runs", async () => {
    const { container } = renderLadder();
    await chooseTab("Sponsor", () => expect(screen.getByLabelText("Your sponsorship")).toBeTruthy());

    const amount = screen.getByLabelText("Your sponsorship");
    const form = screen.getByRole("form", { name: SPONSOR_FORM_DEFAULTS.submitLabel });
    const notice = screen.getByText("Sponsors pay by transfer.");
    const card = blockHolding(container, amount);

    expect(card.contains(form)).toBe(true);
    expect(card.contains(notice)).toBe(true);
    expect(amount.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(form.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sets the notice beside the free field on a tab without suggested amounts or a form", async () => {
    const { container } = renderLadder(LADDER_WITHOUT_FORM);
    await chooseTab("Sponsor", () => expect(screen.getByLabelText("Your sponsorship")).toBeTruthy());

    const amount = screen.getByLabelText("Your sponsorship");
    const notice = screen.getByText("Sponsors pay by transfer.");
    const grid = blockHolding(container, amount);

    expect(grid.contains(notice)).toBe(true);
    expect(notice.compareDocumentPosition(amount) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid.className).toContain("md:grid-cols-2");
  });

  it("says nothing about the minimum on a sponsor tab without a form", async () => {
    renderLadder(LADDER_WITHOUT_FORM);
    await chooseTab("Sponsor", () => expect(screen.getByLabelText("Your sponsorship")).toBeTruthy());
    const field = screen.getByLabelText("Your sponsorship");

    fireEvent.change(field, { target: { value: "20" } });
    fireEvent.blur(field);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("turns a sponsorship below the minimum into a donation, and says so once the field is left", async () => {
    renderLadder();
    await chooseTab("Sponsor", () => expect(screen.getByLabelText("Your sponsorship")).toBeTruthy());
    const field = screen.getByLabelText("Your sponsorship");

    fireEvent.change(field, { target: { value: "20" } });
    expect(line("Purpose")).toBe(PURPOSE_DONATION);
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.blur(field);
    expect(within(screen.getByRole("status")).getByText("Below €50 this is a donation.")).toBeTruthy();
  });
});
