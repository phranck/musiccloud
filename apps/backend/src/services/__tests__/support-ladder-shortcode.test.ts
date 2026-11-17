import {
  ContentContext,
  SITE_VARIABLE_NAMES,
  type SiteVariableValues,
  SUPPORT_LADDER_ATTRIBUTE,
  type SupportLadderConfig,
} from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { MARKDOWN_EXTENSION_REGISTRY } from "../markdown/extension-registry.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** Site variables with a payee and a sponsor minimum of 40 euros; every other value is zero. */
const SITE_VALUES = {
  ...Object.fromEntries(SITE_VARIABLE_NAMES.map((name) => [name, 0])),
  payeeName: "Frank Gregor",
  payeeIban: "AT61 1904 3002 3457 3201",
  payeeBic: "BKAUATWW",
  purposeDonation: "Donation: musiccloud.io",
  purposeSponsor: "Sponsor: musiccloud.io",
  amountSponsorMin: 40,
} as SiteVariableValues;

/** A ladder with a transfer card, two tabs and both routes. */
const LADDER = [
  '[[support-ladder perMonth="per month"',
  "  [[bankaccount",
  '    [[variant key="once" title="Bank transfer" text="Arrives **directly**." icon="sepa" [[qrcode size=200]] [[info text="Check the details."]]]]',
  "  ]]",
  '  [[interval key="once" label="Once" text="Pick an amount."',
  '    [[option amount=10 text="Half a month."]]',
  "    [[option amount=20 recommended]]",
  '    [[custom label="Own amount" placeholder="25"]]',
  "  ]]",
  '  [[interval key="sponsor" label="Sponsor" belowMinimum="Below {min} this is a donation."',
  '    [[custom label="Your amount"]]',
  "  ]]",
  '  [[paypalme url="https://paypal.me/musiccloud" hint="Write *musiccloud.io* in the note."]]',
  '  [[ghsponsor url="https://github.com/sponsors/phranck" button="Sponsor on GitHub"]]',
  "]]",
].join("\n");

/**
 * Reads the configuration the marker carries.
 *
 * @param html - Rendered or served HTML.
 * @returns The parsed configuration, or `null` when no marker carries one.
 */
function readMarker(html: string): SupportLadderConfig | null {
  const match = html.match(new RegExp(`${SUPPORT_LADDER_ATTRIBUTE}="([^"]*)"`));
  if (!match?.[1]) return null;
  const json = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return JSON.parse(json) as SupportLadderConfig;
}

/**
 * Renders a body on the site the way a content page does, with the site variables.
 *
 * @param markdown - The body.
 * @returns The served HTML.
 */
async function served(markdown: string): Promise<string> {
  return sanitizeMarkdownHtml(
    await renderMarkdown(markdown, ContentContext.Frontend, MARKDOWN_EXTENSION_REGISTRY, SITE_VALUES),
  );
}

describe("[[support-ladder]]", () => {
  it("leaves an empty marker carrying the ladder, with every text rendered as Markdown", async () => {
    const html = await served(LADDER);
    const config = readMarker(html);

    expect(html).toMatch(new RegExp(`<div ${SUPPORT_LADDER_ATTRIBUTE}="[^"]+"></div>`));
    expect(config?.intervals.map((interval) => interval.key)).toEqual(["once", "sponsor"]);
    expect(config?.intervals[0]?.options).toEqual([
      { amountEur: 10, description: "<p>Half a month.</p>\n", recommended: false },
      { amountEur: 20, description: "", recommended: true },
    ]);
    expect(config?.bankAccount?.variants[0]?.text).toBe("<p>Arrives <strong>directly</strong>.</p>\n");
    expect(config?.bankAccount?.variants[0]?.qr?.size).toBe(200);
    expect(config?.routes.map((route) => [route.token, route.title, route.button])).toEqual([
      ["paypalme", "PayPal", "PayPal"],
      ["ghsponsor", "GitHub Sponsors", "Sponsor on GitHub"],
    ]);
    expect(config?.labels).toEqual({ perMonth: "per month" });
  });

  it("takes who is paid, the purposes and the sponsor minimum from the settings rather than from the page", async () => {
    const config = readMarker(await served(LADDER));

    expect(config?.payee).toEqual({ name: "Frank Gregor", iban: "AT611904300234573201", bic: "BKAUATWW" });
    expect(config?.minSponsorAmountEur).toBe(40);
    expect(config?.bankAccount?.purposeDonation).toBe("Donation: musiccloud.io");
    expect(config?.bankAccount?.purposeSponsor).toBe("Sponsor: musiccloud.io");
  });

  it("carries an empty payee when the render has no site variables, so no transfer card is drawn", async () => {
    const config = readMarker(sanitizeMarkdownHtml(await renderMarkdown(LADDER, ContentContext.Frontend)));

    expect(config?.payee).toEqual({ name: "", iban: "", bic: "" });
  });

  it("leaves no trace when no tab offers anything to choose", async () => {
    expect(await served('[[support-ladder [[interval key="once" label="Once"]]]]')).not.toContain(
      SUPPORT_LADDER_ATTRIBUTE,
    );
  });

  it("drops a route that leads anywhere but its own host", async () => {
    const config = readMarker(
      await served(
        '[[support-ladder [[interval key="once" [[option amount=5]]]] [[paypalme url="https://evil.example/"]]]]',
      ),
    );

    expect(config?.routes).toEqual([]);
  });

  it("is not offered in the portal, which has no support page", async () => {
    await expect(renderMarkdown(LADDER, ContentContext.DeveloperPortal)).rejects.toThrow(/only allowed in/);
  });
});

describe("the support ladder's marker in the sanitizer", () => {
  it("cleans a marker a page wrote by hand, as it cleans the page around it", async () => {
    const forged = JSON.stringify({
      intervals: [
        {
          key: "once",
          text: '<p onclick="steal()">Hi</p><script>steal()</script><img src="x" onerror="steal()">',
          options: [{ amountEur: 5 }],
        },
      ],
      routes: [{ token: "paypalme", url: "javascript:steal()" }],
      payee: { name: "Mallory", iban: "DE89370400440532013000", bic: "" },
      injected: "<script>",
    }).replace(/"/g, "&quot;");

    const config = readMarker(sanitizeMarkdownHtml(`<div ${SUPPORT_LADDER_ATTRIBUTE}="${forged}"></div>`));

    expect(config?.intervals[0]?.text).toBe('<p>Hi</p><img src="x">');
    expect(config?.routes).toEqual([]);
    expect(config).not.toHaveProperty("injected");
  });

  it("drops a marker whose value is not a ladder", () => {
    const html = sanitizeMarkdownHtml(`<div ${SUPPORT_LADDER_ATTRIBUTE}="not json"></div>`);

    expect(html).toBe("<div></div>");
  });
});
