import {
  ENDPOINTS,
  formatCreditorReference,
  issueSponsorshipReference,
  SPONSOR_FORM_DEFAULTS,
  SUPPORT_LADDER_ATTRIBUTE,
  SUPPORT_LADDER_LABEL_DEFAULTS,
  SupportIntervalKey,
} from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";
import { PENDING_SPONSORSHIP_STORAGE_KEY } from "@/lib/support/pending-sponsorship-store";

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

/** The sponsor minimum these tests use, in euros. */
const MINIMUM = 50;

/** What the sponsorship transfer says before a reference exists. */
const PURPOSE_SPONSOR = "Sponsorship musiccloud.io";

/** A reference issued the way the backend issues one. */
const REFERENCE = issueSponsorshipReference((size) => crypto.getRandomValues(new Uint8Array(size)));

/** What the backend answers once it has stored a request. */
const RECEIPT = { reference: REFERENCE, referenceFormatted: formatCreditorReference(REFERENCE) };

/** A ladder whose only tab is the sponsor tab, whose variant carries a form naming no words of its own. */
const LADDER = {
  intervals: [
    {
      key: SupportIntervalKey.Sponsor,
      label: "Sponsor",
      text: "",
      hint: "",
      belowMinimum: "",
      options: [],
      custom: { label: "Your sponsorship", placeholder: "", text: "" },
    },
  ],
  bankAccount: {
    purposeDonation: "Donation musiccloud.io",
    purposeSponsor: PURPOSE_SPONSOR,
    variants: [
      { key: SupportIntervalKey.Once, title: "Bank transfer", text: "", recommended: true, info: "" },
      {
        key: SupportIntervalKey.Sponsor,
        title: "Bank transfer",
        text: "",
        recommended: false,
        info: "",
        sponsorForm: {},
      },
    ],
  },
  routes: [],
  payee: { name: "musiccloud", iban: "DE89370400440532013000", bic: "COBADEFFXXX" },
  minSponsorAmountEur: MINIMUM,
  labels: {},
};

/** The fetch the form calls, answering whatever a test set up. */
const fetchMock = vi.fn<typeof fetch>();

/**
 * Renders a page body holding the ladder, with the marker escaped the way the backend escapes it.
 *
 * @returns The render result.
 */
function renderLadder() {
  const escaped = JSON.stringify(LADDER).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return render(<MarkdownHtml html={`<div ${SUPPORT_LADDER_ATTRIBUTE}="${escaped}"></div>`} />);
}

/**
 * The transfer card's line for one label.
 *
 * @param label - The line's label.
 * @returns The value element.
 */
function line(label: string): Element | null {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling;
}

/** When the first request is sent in the `issuedAt` test, in milliseconds since the epoch: 1 November 2026. */
const FIRST_SENT_MS = Date.UTC(2026, 10, 1);

/** Days between the first request and its correction in the `issuedAt` test: 30, inside the 60 a reference is kept. */
const DAYS_UNTIL_CORRECTION = 30;

/** Milliseconds in a day: 86,400,000. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the correction is sent in the `issuedAt` test, {@link DAYS_UNTIL_CORRECTION} days after {@link FIRST_SENT_MS}. */
const CORRECTED_MS = FIRST_SENT_MS + DAYS_UNTIL_CORRECTION * DAY_MS;

/**
 * The moment the browser stored for the reference it holds.
 *
 * @returns `issuedAt` as stored, or `undefined` when nothing is stored.
 */
function storedIssuedAt(): number | undefined {
  const raw = window.localStorage.getItem(PENDING_SPONSORSHIP_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as { issuedAt: number }).issuedAt : undefined;
}

/** Fills every field of the form with a sponsor's details. */
function fillForm() {
  fireEvent.change(screen.getByLabelText(SPONSOR_FORM_DEFAULTS.nameLabel), { target: { value: " Ada " } });
  fireEvent.change(screen.getByLabelText(SPONSOR_FORM_DEFAULTS.linkLabel), {
    target: { value: "chaos.social/@ada" },
  });
  fireEvent.change(screen.getByLabelText(SPONSOR_FORM_DEFAULTS.claimLabel), { target: { value: "Music." } });
}

/**
 * A JSON answer from the site.
 *
 * @param status - Its status.
 * @param body - Its body.
 * @returns The response.
 */
function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  drawn.length = 0;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  // The `issuedAt` test holds the clock still, and a failure must not leave it held.
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("the sponsor form", () => {
  it("stands in the sponsor tab with a masked reference line until a reference is issued", () => {
    renderLadder();

    const reference = line(SUPPORT_LADDER_LABEL_DEFAULTS.fieldReference);
    expect(reference?.querySelector(".sr-only")?.textContent).toBe(SUPPORT_LADDER_LABEL_DEFAULTS.referenceMissing);
    expect(reference?.querySelector("[aria-hidden='true']")?.textContent).toMatch(/^X{4}( X{4})*$/);
    expect(line(SUPPORT_LADDER_LABEL_DEFAULTS.fieldPurpose)?.textContent).toBe(PURPOSE_SPONSOR);
    expect(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel })).toHaveProperty("disabled", true);
  });

  it("asks for a reference and puts it into the transfer and the GiroCode in place of the purpose", async () => {
    fetchMock.mockResolvedValue(answer(201, RECEIPT));
    renderLadder();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    expect(await screen.findByText(SPONSOR_FORM_DEFAULTS.issuedTitle)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(ENDPOINTS.frontend.sponsorships);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Ada",
      link: "chaos.social/@ada",
      claim: "Music.",
      published: true,
      amountCents: MINIMUM * 100,
    });
    expect(line(SUPPORT_LADDER_LABEL_DEFAULTS.fieldReference)?.textContent).toBe(RECEIPT.referenceFormatted);
    expect(screen.queryByText(SUPPORT_LADDER_LABEL_DEFAULTS.fieldPurpose, { selector: "dt" })).toBeNull();
    await waitFor(() => expect(drawn.at(-1)).toContain(REFERENCE));
    expect(drawn.at(-1)).not.toContain(PURPOSE_SPONSOR);
  });

  it("shows the same reference after a reload and corrects the details under it", async () => {
    fetchMock.mockResolvedValue(answer(201, RECEIPT));
    const first = renderLadder();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));
    await screen.findByText(SPONSOR_FORM_DEFAULTS.issuedTitle);
    first.unmount();

    renderLadder();
    expect(screen.getByText(SPONSOR_FORM_DEFAULTS.issuedTitle)).toBeTruthy();
    expect(line(SUPPORT_LADDER_LABEL_DEFAULTS.fieldReference)?.textContent).toBe(RECEIPT.referenceFormatted);

    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.changeLabel }));
    const name = screen.getByLabelText(SPONSOR_FORM_DEFAULTS.nameLabel) as HTMLInputElement;
    expect(name.value).toBe("Ada");

    fetchMock.mockResolvedValue(answer(200, RECEIPT));
    fireEvent.change(name, { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    expect(await screen.findByText(SPONSOR_FORM_DEFAULTS.issuedTitle)).toBeTruthy();
    const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
    expect(url).toBe(ENDPOINTS.frontend.sponsorshipDetail(REFERENCE));
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toMatchObject({ name: "Ada Lovelace" });
    expect(line(SUPPORT_LADDER_LABEL_DEFAULTS.fieldReference)?.textContent).toBe(RECEIPT.referenceFormatted);
  });

  it("stamps a correction with the moment it was sent, as it stamps a new reference", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(FIRST_SENT_MS);
    fetchMock.mockResolvedValue(answer(201, RECEIPT));
    renderLadder();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));
    await screen.findByText(SPONSOR_FORM_DEFAULTS.issuedTitle);
    expect(storedIssuedAt()).toBe(FIRST_SENT_MS);

    clock.mockReturnValue(CORRECTED_MS);
    fetchMock.mockResolvedValue(answer(200, RECEIPT));
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.changeLabel }));
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));
    await screen.findByText(SPONSOR_FORM_DEFAULTS.issuedTitle);

    expect(storedIssuedAt()).toBe(CORRECTED_MS);
  });

  it("opens with the switch for being named on, and sends it off once it is flipped", async () => {
    fetchMock.mockResolvedValue(answer(201, RECEIPT));
    renderLadder();

    fillForm();
    const published = screen.getByRole("switch", { name: SPONSOR_FORM_DEFAULTS.publishedLabel });
    expect(published.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(published);
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    await screen.findByText(SPONSOR_FORM_DEFAULTS.issuedTitle);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toMatchObject({ published: false });
  });

  it("words a refusal itself and follows it with the backend's code and error ID", async () => {
    fetchMock.mockResolvedValue(
      answer(400, {
        error: "MC-REQ-0013",
        message: "This address cannot be linked. Please give a website or a profile address. (MC-REQ-0013)",
        errorId: "err-42",
      }),
    );
    renderLadder();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(`${SPONSOR_FORM_DEFAULTS.failureRejected} (MC-REQ-0013) Error ID: err-42`);
    expect(screen.queryByText(SPONSOR_FORM_DEFAULTS.issuedTitle)).toBeNull();
  });

  it("says the form was sent too often when the site answers 429", async () => {
    fetchMock.mockResolvedValue(
      answer(429, { error: "MC-API-0003", message: "Too many requests. (MC-API-0003)", errorId: "err-43" }),
    );
    renderLadder();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(`${SPONSOR_FORM_DEFAULTS.failureRateLimited} (MC-API-0003) Error ID: err-43`);
  });

  it("words a refusal without code or error ID on its own", async () => {
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    renderLadder();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    expect((await screen.findByRole("alertdialog")).textContent).toContain(SPONSOR_FORM_DEFAULTS.failureRejected);
  });

  it("says so when the site cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderLadder();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    expect((await screen.findByRole("alertdialog")).textContent).toContain(SPONSOR_FORM_DEFAULTS.failureOffline);
  });

  it("refuses an address it cannot link to before asking the site", () => {
    renderLadder();

    fillForm();
    fireEvent.change(screen.getByLabelText(SPONSOR_FORM_DEFAULTS.linkLabel), { target: { value: "not an address" } });
    fireEvent.click(screen.getByRole("button", { name: SPONSOR_FORM_DEFAULTS.submitLabel }));

    expect(screen.getByRole("alert").textContent).toBe(SPONSOR_FORM_DEFAULTS.linkInvalid);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
