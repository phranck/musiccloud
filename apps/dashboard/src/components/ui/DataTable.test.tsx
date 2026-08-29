import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { type ColumnDef, DataTable, DataTableScroll, DataTableState } from "@/components/ui/DataTable";

interface Track {
  id: string;
  title: string;
  plays: number;
}

const tracks: Track[] = [
  { id: "1", title: "Beta", plays: 20 },
  { id: "2", title: "Alpha", plays: 3 },
];

const columns: ColumnDef<Track>[] = [
  { id: "title", header: "Title", cell: (track) => track.title, sortKey: (track) => track.title },
  { id: "plays", header: "Plays", cell: (track) => track.plays, sortKey: (track) => track.plays },
];

function renderTable(props: Partial<Parameters<typeof DataTable<Track>>[0]> = {}) {
  return render(
    <DataTable columns={columns} data={tracks} getRowKey={(track) => track.id} {...props}>
      <DataTable.Loading>
        <p>Loading</p>
      </DataTable.Loading>
      <DataTable.Error />
      <DataTable.Empty>
        <p>Nothing here</p>
      </DataTable.Empty>
      <DataTable.Viewport>
        <DataTable.Head sticky />
        <DataTable.Rows />
        <DataTable.Footer>
          <span>Load more</span>
        </DataTable.Footer>
      </DataTable.Viewport>
    </DataTable>,
  );
}

describe("DataTable", () => {
  it("shows the rows and nothing else once it is ready", () => {
    renderTable();

    expect(screen.getByText("Beta")).not.toBeNull();
    expect(screen.queryByText("Loading")).toBeNull();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it.each([
    [DataTableState.Loading, "Loading"],
    [DataTableState.Empty, "Nothing here"],
  ])("shows only the %s slot in that state", (state, visibleText) => {
    renderTable({ state });

    expect(screen.getByText(visibleText)).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("derives the empty state from the data when the caller tracks no state", () => {
    renderTable({ data: [] });

    expect(screen.getByText("Nothing here")).not.toBeNull();
  });

  it("shows the given message in the error state", () => {
    renderTable({ state: DataTableState.Error, errorMessage: "Upstream refused" });

    expect(screen.getByText("Upstream refused")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  /**
   * A scroll port between the sticky header and the surrounding scroll
   * container becomes the element the header anchors to. It grows with the
   * table and never scrolls, so the header would travel with the rows.
   */
  it("renders no scroll port of its own when an ancestor scrolls", () => {
    const { container } = renderTable();

    const viewport = container.querySelector("table")?.parentElement;
    expect(viewport?.className).not.toContain("overflow");
  });

  it("scrolls itself when asked to", () => {
    const { container } = render(
      <DataTable columns={columns} data={tracks} getRowKey={(track) => track.id}>
        <DataTable.Viewport scroll={DataTableScroll.Self}>
          <DataTable.Rows />
        </DataTable.Viewport>
      </DataTable>,
    );

    const viewport = container.querySelector("table")?.parentElement;
    expect(viewport?.className).toContain("overflow-auto");
    expect(viewport?.className).toContain("min-h-0");
  });

  it("marks the sticky header so it holds the top of the scroll port", () => {
    const { container } = renderTable();

    const head = container.querySelector("thead");
    expect(head?.className).toContain("sticky");
    expect(head?.className).toContain("top-0");
  });

  it("spans the footer across every column so it sits inside the scroll port", () => {
    const { container } = renderTable();

    const footerCell = container.querySelector("tfoot td");
    expect(footerCell?.getAttribute("colspan")).toBe(String(columns.length));
    expect(screen.getByText("Load more")).not.toBeNull();
  });

  it("sorts by a column when its header is clicked", async () => {
    const user = userEvent.setup();
    renderTable();

    const rowTitle = () =>
      Array.from(document.querySelectorAll("tbody tr td:first-child")).map((cell) => cell.textContent);
    expect(rowTitle()).toEqual(["Beta", "Alpha"]);

    await user.click(screen.getByText("Title"));
    expect(rowTitle()).toEqual(["Alpha", "Beta"]);

    await user.click(screen.getByText("Title"));
    expect(rowTitle()).toEqual(["Beta", "Alpha"]);
  });

  it("starts from the given sort", () => {
    renderTable({ defaultSort: { id: "plays", dir: "asc" } });

    const plays = Array.from(document.querySelectorAll("tbody tr td:last-child")).map((cell) => cell.textContent);
    expect(plays).toEqual(["3", "20"]);
  });

  it("refuses to render a slot outside a table", () => {
    expect(() => render(<DataTable.Rows />)).toThrow(/inside a <DataTable>/);
  });
});
