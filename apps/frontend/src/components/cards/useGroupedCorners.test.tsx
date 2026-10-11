import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupedCornerList } from "@/components/cards/GroupedCornerList";

const FULL = "var(--neu-radius)";
const INNER = "min(5px, var(--neu-radius))";

/** Marks the list container so the stubbed layout can find it. */
const LIST_CLASS = "grouped-list-under-test";
/** Height of one row including the gap below it, in the stubbed layout. */
const ROW_HEIGHT_PX = 60;
/** Where the list sits inside the well, below the column header. */
const LIST_TOP_PX = 40;
/** Where the list's content ends on the right, in the stubbed layout. */
const LIST_RIGHT_PX = 192;
/** How far short of that edge a row ends while its entrance scale runs. */
const ENTRANCE_SHORTFALL_PX = 3;

/**
 * Stubs the layout jsdom does not have: a recessed well whose list starts
 * below a header, and rows that end a few pixels short of the right edge, the
 * way `scale(0.97)` leaves them while their entrance runs.
 */
function stubLayout(wellBottomPx: number) {
  return vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("recessed-gradient-border")) {
      return DOMRect.fromRect({ x: 0, y: 0, width: 200, height: wellBottomPx });
    }
    if (this.classList.contains(LIST_CLASS)) {
      const rows = this.querySelectorAll("button").length;
      return DOMRect.fromRect({ x: 8, y: LIST_TOP_PX, width: LIST_RIGHT_PX - 8, height: rows * ROW_HEIGHT_PX });
    }
    const rowIndex = Number((this as HTMLElement).dataset.row ?? 0);
    return DOMRect.fromRect({
      x: 11,
      y: LIST_TOP_PX + 3 + rowIndex * ROW_HEIGHT_PX,
      width: LIST_RIGHT_PX - ENTRANCE_SHORTFALL_PX - 11,
      height: ROW_HEIGHT_PX - 6,
    });
  });
}

function renderColumn(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list of placeholder rows
    <div key={index}>
      <button type="button" data-row={index}>
        Row {index}
      </button>
    </div>
  ));
  return render(
    <div className="recessed-gradient-border" style={{ padding: 0, borderWidth: 0 }}>
      <GroupedCornerList className={LIST_CLASS} itemSelector=":scope > * > button" promoteTop={false}>
        {rows}
      </GroupedCornerList>
    </div>,
  );
}

function rowCorners(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("button")).map((row) => [
    row.style.borderTopLeftRadius,
    row.style.borderTopRightRadius,
    row.style.borderBottomRightRadius,
    row.style.borderBottomLeftRadius,
  ]);
}

describe("useGroupedCorners in a genre column", () => {
  let layout: ReturnType<typeof stubLayout>;
  const stylesheet = document.createElement("style");

  beforeEach(() => {
    // The list's padding has to resolve to a number, as it does in a browser.
    stylesheet.textContent = `.${LIST_CLASS} { padding: 0px; border-width: 0px; }`;
    document.head.append(stylesheet);
  });

  afterEach(() => {
    layout.mockRestore();
    stylesheet.remove();
  });

  /**
   * The rows enter scaled, so a reading of their own right edge on mount sees
   * them short of the list's edge. Every row of a single column spans the full
   * width, so its right corners follow its left ones.
   */
  it("promotes both bottom corners of the last row when the list reaches the well's bottom", () => {
    layout = stubLayout(LIST_TOP_PX + 3 * ROW_HEIGHT_PX);
    const { container } = renderColumn(3);

    expect(getComputedStyle(container.querySelector(`.${LIST_CLASS}`)!).paddingRight).toBe("0px");
    expect(rowCorners(container)).toEqual([
      [INNER, INNER, INNER, INNER],
      [INNER, INNER, INNER, INNER],
      [INNER, INNER, FULL, FULL],
    ]);
  });

  it("keeps interior corners on a column that ends above the well's bottom", () => {
    layout = stubLayout(LIST_TOP_PX + 5 * ROW_HEIGHT_PX);
    const { container } = renderColumn(3);

    expect(rowCorners(container).at(-1)).toEqual([INNER, INNER, INNER, INNER]);
  });
});
