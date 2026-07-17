import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SegmentedCard } from "./SegmentedCard";

describe("SegmentedCard", () => {
  it("normalizes the complete card, switch, panel, and footer hierarchy", () => {
    const html = renderToStaticMarkup(
      <SegmentedCard data-segmented-card>
        <SegmentedCard.Header>
          <SegmentedCard.Header.Title>Download an SDK</SegmentedCard.Header.Title>
          <SegmentedCard.Header.Segments role="tablist" aria-label="SDK language">
            <SegmentedCard.Header.Segments.Item role="tab" aria-selected="true">
              <SegmentedCard.Header.Segments.Item.Icon>
                <img src="/icons/languages/typescript.svg" alt="" />
              </SegmentedCard.Header.Segments.Item.Icon>
              <SegmentedCard.Header.Segments.Item.Label>TypeScript</SegmentedCard.Header.Segments.Item.Label>
            </SegmentedCard.Header.Segments.Item>
          </SegmentedCard.Header.Segments>
        </SegmentedCard.Header>
        <SegmentedCard.Body>
          <SegmentedCard.Body.Panel id="sdk-typescript" role="tabpanel">
            <SegmentedCard.Body.Panel.Copy>SDK copy</SegmentedCard.Body.Panel.Copy>
            <SegmentedCard.Body.Panel.Stack>SDK details</SegmentedCard.Body.Panel.Stack>
          </SegmentedCard.Body.Panel>
        </SegmentedCard.Body>
        <SegmentedCard.Footer>Download</SegmentedCard.Footer>
      </SegmentedCard>,
    );

    expect(html).toContain('data-segmented-card="true" class="surface-card content-card segmented-card"');
    expect(html).toContain('class="content-card__header segmented-card__header"');
    expect(html).toContain('class="content-card__title segmented-card__title"');
    expect(html).toMatch(/role="tablist"[^>]*class="segmented-control segmented-card__segments"/);
    expect(html).toContain('class="segmented-control__item-icon"');
    expect(html).toContain('class="segmented-control__item-label">TypeScript</span>');
    expect(html).toContain('data-segmented-card-body="true" class="content-card__body segmented-card__body"');
    expect(html).toMatch(/id="sdk-typescript"[^>]*role="tabpanel"[^>]*class="segmented-card__panel"/);
    expect(html).toContain('class="content-card__copy segmented-card__panel-copy">SDK copy</div>');
    expect(html).toContain('class="content-card__body-stack segmented-card__panel-stack">SDK details</div>');
    expect(html).toContain('class="content-card__footer segmented-card__footer">Download</footer>');
  });
});
