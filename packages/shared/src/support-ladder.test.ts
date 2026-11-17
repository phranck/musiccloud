import { describe, expect, it } from "vitest";
import { parseShortcodes } from "./markdown-shortcode-parser.js";
import { SUPPORT_LADDER_SHORTCODE } from "./markdown-shortcodes/support-ladder.js";
import {
  isAllowedSupportRouteUrl,
  mapSupportLadderHtml,
  parseSupportLadderAttribute,
  readSupportLadderConfig,
  SupportRouteToken,
} from "./support-ladder.js";

/** A ladder with one tab of every kind and both routes. */
const COMPLETE = {
  intervals: [
    {
      key: "once",
      label: "Once",
      text: "<p>A single payment.</p>",
      options: [
        { amountEur: 10, description: "<p>Half.</p>", recommended: false },
        { amountEur: 20, description: "", recommended: true },
      ],
      custom: { label: "Own amount", placeholder: "25", text: "" },
    },
    { key: "sponsor", label: "Sponsor", belowMinimum: "<p>Below {min}.</p>", options: [], custom: { label: "Amount" } },
  ],
  bankAccount: {
    purposeDonation: "Donation: musiccloud.io",
    purposeSponsor: "Sponsor: musiccloud.io",
    variants: [{ key: "once", title: "Transfer", text: "<p>Direct.</p>", icon: "sepa", qr: { size: 176 }, info: "" }],
  },
  routes: [
    { token: "paypalme", url: "https://paypal.me/musiccloud", title: "PayPal", text: "", hint: "", button: "Open" },
    {
      token: "ghsponsor",
      url: "https://github.com/sponsors/phranck",
      title: "Sponsors",
      text: "",
      hint: "",
      button: "Open",
    },
  ],
  payee: { name: "Frank Gregor", iban: "AT611904300234573201", bic: "BKAUATWW" },
  minSponsorAmountEur: 40,
  labels: { perMonth: "per month", unknown: "dropped" },
};

describe("readSupportLadderConfig", () => {
  it("keeps a complete ladder as it is, apart from unknown labels", () => {
    const config = readSupportLadderConfig(COMPLETE);

    expect(config?.intervals.map((interval) => interval.key)).toEqual(["once", "sponsor"]);
    expect(config?.routes).toHaveLength(2);
    expect(config?.payee.iban).toBe("AT611904300234573201");
    expect(config?.minSponsorAmountEur).toBe(40);
    expect(config?.labels).toEqual({ perMonth: "per month" });
  });

  it("keeps the first of two tabs with one key, and the first recommended amount", () => {
    const config = readSupportLadderConfig({
      intervals: [
        {
          key: "once",
          options: [
            { amountEur: 5, recommended: true },
            { amountEur: 10, recommended: true },
          ],
        },
        { key: "once", options: [{ amountEur: 99 }] },
      ],
    });

    expect(config?.intervals).toHaveLength(1);
    expect(config?.intervals[0]?.options.map((option) => option.recommended)).toEqual([true, false]);
  });

  it("drops amounts that are not positive numbers within the ledger's bound", () => {
    const config = readSupportLadderConfig({
      intervals: [
        { key: "once", options: [{ amountEur: 0 }, { amountEur: "20" }, { amountEur: 1e9 }, { amountEur: 15 }] },
      ],
    });

    expect(config?.intervals[0]?.options.map((option) => option.amountEur)).toEqual([15]);
  });

  it("keeps an amount named twice in one tab once, with the first description", () => {
    const config = readSupportLadderConfig({
      intervals: [
        {
          key: "once",
          options: [
            { amountEur: 10, description: "<p>First</p>" },
            { amountEur: 10, description: "<p>Second</p>" },
          ],
        },
      ],
    });

    expect(config?.intervals[0]?.options.map((option) => option.description)).toEqual(["<p>First</p>"]);
  });

  it("returns nothing when no tab offers anything", () => {
    expect(readSupportLadderConfig({ intervals: [{ key: "once", options: [] }] })).toBeNull();
    expect(readSupportLadderConfig([])).toBeNull();
    expect(parseSupportLadderAttribute("{not json")).toBeNull();
  });

  it("drops a route that leads anywhere but the route's own host", () => {
    const config = readSupportLadderConfig({
      ...COMPLETE,
      routes: [
        { token: "paypalme", url: "https://evil.example/paypal.me" },
        { token: "ghsponsor", url: "https://github.com/phranck" },
        { token: "paypalme", url: "javascript:alert(1)" },
      ],
    });

    expect(config?.routes).toEqual([]);
  });

  it("drops a GiroCode style a page could abuse, and keeps the rest", () => {
    const config = readSupportLadderConfig({
      ...COMPLETE,
      bankAccount: {
        variants: [
          {
            key: "once",
            qr: {
              color: "red;background:url(x)",
              image: "//evil.example/x.png",
              size: 5000,
              dots: "hearts",
              margin: 8,
            },
          },
        ],
      },
    });

    expect(config?.bankAccount?.variants[0]?.qr).toEqual({
      color: undefined,
      background: undefined,
      size: undefined,
      margin: 8,
      dots: undefined,
      corners: undefined,
      image: undefined,
    });
  });

  it("empties a payee field that is not in the shape a transfer carries", () => {
    const config = readSupportLadderConfig({ ...COMPLETE, payee: { name: "Frank", iban: "AT61 1904", bic: "x" } });

    expect(config?.payee).toEqual({ name: "Frank", iban: "", bic: "" });
  });
});

describe("isAllowedSupportRouteUrl", () => {
  it.each([
    [SupportRouteToken.PaypalMe, "https://paypal.me/musiccloud", true],
    [SupportRouteToken.PaypalMe, "https://www.paypal.com/paypalme/musiccloud", true],
    [SupportRouteToken.PaypalMe, "http://paypal.me/musiccloud", false],
    [SupportRouteToken.PaypalMe, "https://paypal.me.evil.example/", false],
    [SupportRouteToken.PaypalMe, "https://user@paypal.me/x", false],
    [SupportRouteToken.GithubSponsors, "https://github.com/sponsors/phranck", true],
    [SupportRouteToken.GithubSponsors, "https://github.com/phranck", false],
  ] as const)("%s %s → %s", (token, url, allowed) => {
    expect(isAllowedSupportRouteUrl(token, url)).toBe(allowed);
  });
});

describe("mapSupportLadderHtml", () => {
  it("reaches every rendered text field and no plain one", () => {
    const config = readSupportLadderConfig({
      ...COMPLETE,
      intervals: [
        {
          key: "once",
          label: "L",
          text: "t",
          hint: "h",
          belowMinimum: "b",
          options: [{ amountEur: 1, description: "d" }],
          custom: { label: "L", placeholder: "P", text: "c" },
        },
      ],
      bankAccount: { purposeDonation: "P", variants: [{ key: "once", title: "L", text: "v", info: "i" }] },
      routes: [{ token: "paypalme", url: "https://paypal.me/x", title: "L", text: "r", hint: "h", button: "L" }],
    });
    if (!config) throw new Error("the ladder should read");

    const mapped = mapSupportLadderHtml(config, (html) => (html ? `<${html}>` : html));

    const interval = mapped.intervals[0];
    expect([
      interval?.text,
      interval?.hint,
      interval?.belowMinimum,
      interval?.options[0]?.description,
      interval?.custom?.text,
    ]).toEqual(["<t>", "<h>", "<b>", "<d>", "<c>"]);
    expect([mapped.bankAccount?.variants[0]?.text, mapped.bankAccount?.variants[0]?.info]).toEqual(["<v>", "<i>"]);
    expect([mapped.routes[0]?.text, mapped.routes[0]?.hint]).toEqual(["<r>", "<h>"]);
    expect([
      interval?.label,
      interval?.custom?.placeholder,
      mapped.routes[0]?.button,
      mapped.bankAccount?.purposeDonation,
    ]).toEqual(["L", "P", "L", "P"]);
  });
});

describe("SUPPORT_LADDER_SHORTCODE", () => {
  it("resolves every node of the tree with its own parameters", () => {
    const [ladder] = parseShortcodes(
      [
        '[[support-ladder perMonth="per month"',
        "  [[bankaccount",
        '    [[variant key="once" title="Transfer" icon="sepa" [[qrcode size=200 dots="rounded"]] [[info text="Check it."]]]]',
        "  ]]",
        '  [[interval key="once" label="Once" [[option amount=20 recommended]] [[custom label="Own"]]]]',
        '  [[paypalme url="https://paypal.me/x"]]',
        '  [[ghsponsor url="https://github.com/sponsors/x"]]',
        "]]",
      ].join("\n"),
      [SUPPORT_LADDER_SHORTCODE],
    );

    expect(ladder?.issues).toEqual([]);
    expect(ladder?.params.perMonth).toBe("per month");
    expect(ladder?.children.map((child) => child.token)).toEqual(["bankaccount", "interval", "paypalme", "ghsponsor"]);
    const variant = ladder?.children[0]?.children[0];
    expect(variant?.params).toMatchObject({ key: "once", icon: "sepa" });
    expect(variant?.children.map((child) => child.params)).toEqual([
      { size: 200, dots: "rounded" },
      { text: "Check it." },
    ]);
    expect(ladder?.children[1]?.children[0]?.params).toEqual({ amount: "20", recommended: true });
  });
});
