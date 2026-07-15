import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "@/components/SegmentedControl";
import { ContentCard } from "./ContentCard";
import { EndpointCard } from "./EndpointCard";
import { ResponseCard } from "./ResponseCard";
import { ResponseTone } from "./responseCard.types";
import { SchemaCard } from "./SchemaCard";

describe("API content cards", () => {
  it("normalizes the complete ContentCard hierarchy", () => {
    const html = renderToStaticMarkup(
      <ContentCard>
        <ContentCard.Header>
          <ContentCard.Header.Title>Title</ContentCard.Header.Title>
          <ContentCard.Header.Addon>Addon</ContentCard.Header.Addon>
        </ContentCard.Header>
        <ContentCard.Body>
          <ContentCard.Body.Intro>Intro</ContentCard.Body.Intro>
          <ContentCard.Body.Stack>
            <ContentCard.Body.Section>
              <ContentCard.Body.Section.Header>
                <ContentCard.Body.Section.Header.Icon>Icon</ContentCard.Body.Section.Header.Icon>
                <ContentCard.Body.Section.Header.Title>Section</ContentCard.Body.Section.Header.Title>
                <ContentCard.Body.Section.Header.Addon>Meta</ContentCard.Body.Section.Header.Addon>
              </ContentCard.Body.Section.Header>
              <ContentCard.Body.Section.Body>Body</ContentCard.Body.Section.Body>
            </ContentCard.Body.Section>
          </ContentCard.Body.Stack>
        </ContentCard.Body>
        <ContentCard.Footer>Footer</ContentCard.Footer>
      </ContentCard>,
    );

    expect(html).toContain('<h3 class="content-card__title">Title</h3>');
    expect(html).toContain('<div class="content-card__body-intro">Intro</div>');
    expect(html).toContain('<div class="content-card__body-stack">');
    expect(html).toContain('<section class="content-card__section">');
    expect(html).toContain('<header class="content-card__section-header">');
    expect(html).toContain('<h4 class="content-card__section-title">Section</h4>');
    expect(html).toContain('<div class="content-card__section-body">Body</div>');
  });

  it("specializes endpoint and response layouts without rebuilding shared card geometry", () => {
    const html = renderToStaticMarkup(
      <>
        <EndpointCard>
          <EndpointCard.Header method="GET">
            <EndpointCard.Header.Request>
              <EndpointCard.Header.Request.Method>GET</EndpointCard.Header.Request.Method>
              <EndpointCard.Header.Request.Path>/health/backend</EndpointCard.Header.Request.Path>
            </EndpointCard.Header.Request>
            <EndpointCard.Header.Addon>
              <EndpointCard.Header.Addon.Access>Public endpoint</EndpointCard.Header.Addon.Access>
            </EndpointCard.Header.Addon>
          </EndpointCard.Header>
          <EndpointCard.Body>Body</EndpointCard.Body>
        </EndpointCard>
        <ResponseCard tone={ResponseTone.Success}>
          <ResponseCard.Status status="200" tone={ResponseTone.Success} />
          <ResponseCard.Content>
            <ResponseCard.Content.Summary>Default Response</ResponseCard.Content.Summary>
            <ResponseCard.Content.Meta>
              <ResponseCard.Content.Meta.Row>
                <ResponseCard.Content.Meta.Item>
                  <ResponseCard.Content.Meta.Label>Content-Type:</ResponseCard.Content.Meta.Label>
                  <ResponseCard.Content.Meta.MediaType>application/json</ResponseCard.Content.Meta.MediaType>
                </ResponseCard.Content.Meta.Item>
                <ResponseCard.Content.Meta.Item>
                  <ResponseCard.Content.Meta.Label>Response Object:</ResponseCard.Content.Meta.Label>
                  <ResponseCard.Content.Meta.SchemaLink href="#schema-error-response">
                    <ResponseCard.Content.Meta.SchemaName>ErrorResponse</ResponseCard.Content.Meta.SchemaName>
                  </ResponseCard.Content.Meta.SchemaLink>
                </ResponseCard.Content.Meta.Item>
              </ResponseCard.Content.Meta.Row>
            </ResponseCard.Content.Meta>
          </ResponseCard.Content>
        </ResponseCard>
      </>,
    );

    expect(html).toContain('class="surface-card content-card endpoint-card"');
    expect(html).toContain('class="content-card__header endpoint-card__header endpoint-card__header--get"');
    expect(html).toContain('<code class="endpoint-card__method">GET</code>');
    expect(html).toContain('<code class="endpoint-card__path">/health/backend</code>');
    expect(html).toContain('class="content-panel response-card response-card--success"');
    expect(html).toContain('<div class="response-card__summary">Default Response</div>');
    expect(html).toContain('<div class="response-card__meta">');
    expect(html).toContain('<span class="response-card__meta-label">Content-Type:</span>');
    expect(html).toContain('<code class="response-card__media-type">application/json</code>');
    expect(html).toContain('<span class="response-card__meta-label">Response Object:</span>');
    expect(html).toContain(
      '<a href="#schema-error-response" class="content-link response-card__schema-link"><code class="response-card__schema-name">ErrorResponse</code></a>',
    );
  });

  it("keeps schema documentation tabs, fields, and variants in one compound hierarchy", () => {
    const html = renderToStaticMarkup(
      <SchemaCard data-schema-card>
        <SchemaCard.Header>
          <SchemaCard.Header.Toggle type="button" aria-expanded="true" aria-controls="schema-content" />
          <SchemaCard.Header.Title>Key documentation</SchemaCard.Header.Title>
          <SchemaCard.Header.Addon>
            <SegmentedControl role="tablist">
              <SegmentedControl.Item role="tab">Key documentation</SegmentedControl.Item>
            </SegmentedControl>
            <SchemaCard.Header.Chevron aria-hidden="true">Chevron</SchemaCard.Header.Chevron>
          </SchemaCard.Header.Addon>
        </SchemaCard.Header>
        <SchemaCard.Collapsible id="schema-content">
          <SchemaCard.Collapsible.Content>
            <SchemaCard.Body>
              <SchemaCard.Body.Panel role="tabpanel">
                <SchemaCard.Body.Fields>
                  <SchemaCard.Body.Fields.Header>
                    <SchemaCard.Body.Fields.Header.Row>
                      <SchemaCard.Body.Fields.Header.Cell scope="col">Key</SchemaCard.Body.Fields.Header.Cell>
                      <SchemaCard.Body.Fields.Header.Cell scope="col">Key Presence</SchemaCard.Body.Fields.Header.Cell>
                      <SchemaCard.Body.Fields.Header.Cell scope="col">Value Type</SchemaCard.Body.Fields.Header.Cell>
                      <SchemaCard.Body.Fields.Header.Cell scope="col">Description</SchemaCard.Body.Fields.Header.Cell>
                    </SchemaCard.Body.Fields.Header.Row>
                  </SchemaCard.Body.Fields.Header>
                  <SchemaCard.Body.Fields.Body>
                    <SchemaCard.Body.Fields.Field data-depth={0}>
                      <SchemaCard.Body.Fields.Field.Name>track</SchemaCard.Body.Fields.Field.Name>
                      <SchemaCard.Body.Fields.Field.Presence>
                        <SchemaCard.Body.Fields.Field.Presence.Badge data-key-presence="included">
                          included
                        </SchemaCard.Body.Fields.Field.Presence.Badge>
                      </SchemaCard.Body.Fields.Field.Presence>
                      <SchemaCard.Body.Fields.Field.Value>
                        <SchemaCard.Body.Fields.Field.Value.Type>Track</SchemaCard.Body.Fields.Field.Value.Type>
                      </SchemaCard.Body.Fields.Field.Value>
                      <SchemaCard.Body.Fields.Field.Description>
                        Resolved track metadata.
                      </SchemaCard.Body.Fields.Field.Description>
                    </SchemaCard.Body.Fields.Field>
                  </SchemaCard.Body.Fields.Body>
                </SchemaCard.Body.Fields>
                <SchemaCard.Body.Variants>
                  <SchemaCard.Body.Variants.Title>Response variants</SchemaCard.Body.Variants.Title>
                  <SchemaCard.Body.Variants.List>
                    <SchemaCard.Body.Variants.List.Item>TrackResolveSuccess</SchemaCard.Body.Variants.List.Item>
                  </SchemaCard.Body.Variants.List>
                </SchemaCard.Body.Variants>
              </SchemaCard.Body.Panel>
            </SchemaCard.Body>
          </SchemaCard.Collapsible.Content>
        </SchemaCard.Collapsible>
      </SchemaCard>,
    );

    expect(html).toContain('class="surface-card content-card schema-card"');
    expect(html).toContain('class="schema-card__header-toggle"');
    expect(html).toContain('aria-hidden="true" class="schema-card__header-chevron">Chevron</span>');
    expect(html).toContain('id="schema-content" class="schema-card__collapsible"');
    expect(html).toContain('class="schema-card__collapsible-content"');
    expect(html).toContain('role="tablist" class="segmented-control"');
    expect(html).toContain('role="tab" class="segmented-control__item">Key documentation</button>');
    expect(html).toContain('<table class="schema-card__field-table">');
    expect(html).toContain('<th scope="col" class="schema-card__field-heading">Key</th>');
    expect(html).toContain('<th scope="col" class="schema-card__field-heading">Key Presence</th>');
    expect(html).toMatch(
      /<th scope="col" class="schema-card__field-heading">Key<\/th><th scope="col" class="schema-card__field-heading">Key Presence<\/th><th scope="col" class="schema-card__field-heading">Value Type<\/th><th scope="col" class="schema-card__field-heading">Description<\/th>/,
    );
    expect(html).toContain('<tbody class="schema-card__field-body">');
    expect(html).toContain('data-depth="0" class="schema-card__field"');
    expect(html).toContain('class="schema-card__field-value-type">Track</code>');
    expect(html).toContain(
      'class="schema-card__field-presence"><span data-key-presence="included" class="schema-card__field-presence-badge">included</span>',
    );
    expect(html).toContain('class="schema-card__variants-list"');
  });
});
