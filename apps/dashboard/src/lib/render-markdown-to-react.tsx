import type { Marked } from "marked";
import type { ReactNode } from "react";

type MarkdownToken = {
  type: string;
  depth?: number;
  href?: string | null;
  items?: MarkdownToken[];
  lang?: string;
  ordered?: boolean;
  raw?: string;
  start?: number;
  text?: string;
  tokens?: MarkdownToken[];
};

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function getSafeHref(href: string | null | undefined): string | null {
  if (!href) return null;

  try {
    const url = new URL(href, window.location.origin);
    if (SAFE_LINK_PROTOCOLS.has(url.protocol)) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function InlineTokens({ tokens, keyPrefix }: { tokens: MarkdownToken[]; keyPrefix: string }) {
  return (
    <>
      {tokens.map((token, index) => {
        const key = `${keyPrefix}-${index}`;
        return <InlineToken key={key} token={token} keyPrefix={key} />;
      })}
    </>
  );
}

function InlineToken({ token, keyPrefix }: { token: MarkdownToken; keyPrefix: string }) {
  switch (token.type) {
    case "br":
      return <br />;
    case "codespan":
      return <code>{token.text ?? ""}</code>;
    case "em":
      return (
        <em>
          <InlineTokens tokens={token.tokens ?? []} keyPrefix={keyPrefix} />
        </em>
      );
    case "link":
    case "url": {
      const href = getSafeHref(token.href);
      const children =
        token.tokens && token.tokens.length > 0 ? (
          <InlineTokens tokens={token.tokens} keyPrefix={keyPrefix} />
        ) : (
          (token.text ?? href ?? "")
        );

      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        children
      );
    }
    case "strong":
      return (
        <strong>
          <InlineTokens tokens={token.tokens ?? []} keyPrefix={keyPrefix} />
        </strong>
      );
    case "text":
      return token.tokens && token.tokens.length > 0 ? (
        <InlineTokens tokens={token.tokens} keyPrefix={keyPrefix} />
      ) : (
        (token.text ?? "")
      );
    default:
      return <>{token.text ?? token.raw ?? ""}</>;
  }
}

function BlockTokens({ tokens, keyPrefix }: { tokens: MarkdownToken[]; keyPrefix: string }) {
  return (
    <>
      {tokens.map((token, index) => {
        const key = `${keyPrefix}-${index}`;
        return <BlockToken key={key} token={token} keyPrefix={key} />;
      })}
    </>
  );
}

function BlockToken({ token, keyPrefix }: { token: MarkdownToken; keyPrefix: string }) {
  switch (token.type) {
    case "blockquote":
      return (
        <blockquote>
          <BlockTokens tokens={token.tokens ?? []} keyPrefix={keyPrefix} />
        </blockquote>
      );
    case "code":
      return (
        <pre>
          <code>{token.text ?? ""}</code>
        </pre>
      );
    case "heading": {
      const Tag = HEADING_TAGS[Math.min(Math.max(token.depth ?? 1, 1), 6) - 1] ?? "h1";
      return (
        <Tag>
          <InlineTokens tokens={token.tokens ?? []} keyPrefix={keyPrefix} />
        </Tag>
      );
    }
    case "html":
      return null;
    case "list": {
      const ListTag = token.ordered ? "ol" : "ul";
      return (
        <ListTag start={token.ordered ? token.start : undefined}>
          {(token.items ?? []).map((item) => {
            const itemKey = `${keyPrefix}-item-${item.raw ?? item.text ?? "item"}`;
            return (
              <li key={itemKey}>
                {item.tokens && item.tokens.length > 0 ? (
                  <BlockTokens tokens={item.tokens} keyPrefix={itemKey} />
                ) : (
                  <InlineTokens tokens={item.tokens ?? []} keyPrefix={itemKey} />
                )}
              </li>
            );
          })}
        </ListTag>
      );
    }
    case "paragraph":
      return (
        <p>
          <InlineTokens tokens={token.tokens ?? []} keyPrefix={keyPrefix} />
        </p>
      );
    case "space":
      return null;
    case "text":
      return token.tokens && token.tokens.length > 0 ? (
        <InlineTokens tokens={token.tokens} keyPrefix={keyPrefix} />
      ) : (
        <p>{token.text ?? ""}</p>
      );
    default:
      return null;
  }
}

export function renderMarkdownToReact(markdown: string, marked: Pick<Marked, "lexer">): ReactNode {
  const tokens = marked.lexer(markdown) as MarkdownToken[];
  return <BlockTokens tokens={tokens} keyPrefix="md" />;
}
