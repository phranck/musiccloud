import { describe, expect, it } from "vitest";

import { fillPromptNumbers } from "./prompt-numbers";

const counts = { linksResolved: 7, sharePagesOpened: 3 };

describe("fillPromptNumbers", () => {
  it("keeps the bare placeholder yielding only the number", () => {
    expect(fillPromptNumbers("<p>{links} and {views}</p>", counts)).toBe("<p>7 and 3</p>");
  });

  it("takes the singular at one and the plural everywhere else", () => {
    const text = "<p>{views share|shares}</p>";

    expect(fillPromptNumbers(text, { ...counts, sharePagesOpened: 1 })).toBe("<p>1 share</p>");
    expect(fillPromptNumbers(text, { ...counts, sharePagesOpened: 2 })).toBe("<p>2 shares</p>");
    expect(fillPromptNumbers(text, { ...counts, sharePagesOpened: 0 })).toBe("<p>0 shares</p>");
  });

  it("fills both kinds of count in one text", () => {
    expect(
      fillPromptNumbers("<p>{links link|links}, {views share|shares}</p>", {
        linksResolved: 1,
        sharePagesOpened: 4,
      }),
    ).toBe("<p>1 link, 4 shares</p>");
  });

  it("keeps the forms as written, spaces and markup included", () => {
    expect(
      fillPromptNumbers("<p>{links <em>found song</em>|<em>found songs</em>}</p>", {
        ...counts,
        linksResolved: 1,
      }),
    ).toBe("<p>1 <em>found song</em></p>");
  });

  it("leaves a placeholder it does not know alone", () => {
    expect(fillPromptNumbers("<p>{orders order|orders}</p>", counts)).toBe("<p>{orders order|orders}</p>");
  });

  it("leaves a placeholder without a second form alone, rather than guessing one", () => {
    expect(fillPromptNumbers("<p>{views share}</p>", counts)).toBe("<p>{views share}</p>");
  });
});
