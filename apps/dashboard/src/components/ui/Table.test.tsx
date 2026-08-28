import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { type ColumnDef, DataTable } from "@/components/ui/Table";

interface Row {
  id: string;
  title: string;
}

const rows: Row[] = [
  { id: "1", title: "First" },
  { id: "2", title: "Second" },
];

const columns: ColumnDef<Row>[] = [
  { id: "title", header: "Title", cell: (row) => row.title },
  { id: "id", header: "Id", cell: (row) => row.id },
];

describe("DataTable", () => {
  it("wraps the table in a horizontal scroll box by default", () => {
    const { container } = render(<DataTable columns={columns} data={rows} getRowKey={(row) => row.id} />);

    const table = container.querySelector("table");
    expect(table?.parentElement?.className).toContain("overflow-x-auto");
  });

  /**
   * A scroll box between the sticky header and the surrounding scroll container
   * becomes the scroll port the header anchors to. That box grows with the
   * table and never scrolls, so the header would travel with the rows.
   */
  it("renders no scroll box of its own when the header is sticky", () => {
    const { container } = render(<DataTable columns={columns} data={rows} getRowKey={(row) => row.id} stickyHeader />);

    const table = container.querySelector("table");
    expect(table).not.toBeNull();

    for (let node = table?.parentElement ?? null; node !== null; node = node.parentElement) {
      expect(node.className).not.toContain("overflow-x-auto");
    }
  });

  it("marks the sticky header so it holds the top of the scroll container", () => {
    const { container } = render(<DataTable columns={columns} data={rows} getRowKey={(row) => row.id} stickyHeader />);

    const head = container.querySelector("thead");
    expect(head?.className).toContain("sticky");
    expect(head?.className).toContain("top-0");
  });
});
