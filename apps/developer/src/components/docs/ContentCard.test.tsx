import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContentCard } from "./ContentCard";
import { EndpointCard } from "./EndpointCard";
import { ResponseCard } from "./ResponseCard";
import { ResponseTone } from "./responseCard.types";

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
              <ResponseCard.Content.Meta.MediaType>application/json</ResponseCard.Content.Meta.MediaType>
              <ResponseCard.Content.Meta.SchemaLink href="#schema-response">
                Response
              </ResponseCard.Content.Meta.SchemaLink>
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
  });
});
