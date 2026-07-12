import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContentPanel } from "./ContentPanel";
import { ParameterCard } from "./ParameterCard";
import { RequestBodyCard } from "./RequestBodyCard";

describe("ContentPanel compounds", () => {
  it("provides one reusable inner-surface structure", () => {
    const html = renderToStaticMarkup(
      <ContentPanel>
        <ContentPanel.Header>
          <ContentPanel.Header.Title>Header</ContentPanel.Header.Title>
        </ContentPanel.Header>
        <ContentPanel.Leading>Leading</ContentPanel.Leading>
        <ContentPanel.Content>Content</ContentPanel.Content>
        <ContentPanel.Meta>Meta</ContentPanel.Meta>
        <ContentPanel.Footer>Footer</ContentPanel.Footer>
      </ContentPanel>,
    );

    expect(html).toContain('<div class="content-panel">');
    expect(html).toContain('<div class="content-panel__header">');
    expect(html).toContain('<h3 class="content-panel__header-title">Header</h3>');
    expect(html).toContain('<div class="content-panel__leading">Leading</div>');
    expect(html).toContain('<div class="content-panel__content">Content</div>');
    expect(html).toContain('<div class="content-panel__meta">Meta</div>');
    expect(html).toContain('<div class="content-panel__footer">Footer</div>');
  });

  it("builds parameter and request-body cards on the shared panel surface", () => {
    const html = renderToStaticMarkup(
      <>
        <ParameterCard>
          <ParameterCard.Header>
            <ParameterCard.Header.Name>query</ParameterCard.Header.Name>
            <ParameterCard.Header.Location>body</ParameterCard.Header.Location>
            <ParameterCard.Header.Requirement>Required</ParameterCard.Header.Requirement>
          </ParameterCard.Header>
          <ParameterCard.Body>Description</ParameterCard.Body>
        </ParameterCard>
        <RequestBodyCard>
          <RequestBodyCard.Header>
            <RequestBodyCard.Header.MediaType>application/json</RequestBodyCard.Header.MediaType>
            <RequestBodyCard.Header.SchemaLink href="#schema-request">Request</RequestBodyCard.Header.SchemaLink>
          </RequestBodyCard.Header>
          <RequestBodyCard.Body>
            <RequestBodyCard.Body.Example>Example</RequestBodyCard.Body.Example>
          </RequestBodyCard.Body>
        </RequestBodyCard>
      </>,
    );

    expect(html).toContain('class="content-panel parameter-card"');
    expect(html).toContain('class="content-panel request-body-card"');
    expect(html).toContain('<code class="parameter-card__name">query</code>');
    expect(html).toContain('<code class="request-body-card__media-type">application/json</code>');
  });
});
