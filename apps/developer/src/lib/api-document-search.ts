/** A normalized, searchable content unit from the rendered API document. */
export interface DocumentSearchEntry {
  addon?: string;
  element: HTMLElement;
  group: string;
  kind: string;
  targetId: string;
  text: string;
  title: string;
}

/** One ranked document match with the context needed by the result overlay. */
export interface DocumentSearchResult extends DocumentSearchEntry {
  matchedTerm: string;
  score: number;
  snippet: string;
}

/** Search matches grouped under their visible API-reference area. */
export interface DocumentSearchResultGroup {
  group: string;
  results: DocumentSearchResult[];
}

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Removes fenced examples and controls before extracting searchable prose. */
function searchableText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("pre, [data-code-block], script, style, button, .sr-only, [data-api-search-ignore]")
    .forEach((node) => node.remove());
  return clone.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** Builds one source-of-truth index from explicitly marked rendered content. */
export function buildDocumentSearchIndex(root: HTMLElement): DocumentSearchEntry[] {
  return [...root.querySelectorAll<HTMLElement>("[data-api-search-entry]")].flatMap((element) => {
    const group = element.dataset.apiSearchGroup?.trim();
    const title = element.dataset.apiSearchTitle?.trim();
    const targetId = element.dataset.apiSearchTarget?.trim() || element.id;
    if (!group || !title || !targetId) return [];

    return [
      {
        addon: element.dataset.apiSearchAddon?.trim() || undefined,
        element,
        group,
        kind: element.dataset.apiSearchKind?.trim() || "document",
        targetId,
        text: searchableText(element),
        title,
      },
    ];
  });
}

function matchedTerm(text: string, query: string, terms: string[]): string {
  if (normalize(text).includes(query)) return query;
  return terms.find((term) => normalize(text).includes(term)) ?? terms[0] ?? query;
}

function resultSnippet(text: string, term: string): string {
  const normalizedText = normalize(text);
  const matchIndex = normalizedText.indexOf(term);
  if (matchIndex < 0 || text.length <= 150) return text;
  const start = Math.max(0, matchIndex - 52);
  const end = Math.min(text.length, matchIndex + term.length + 82);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** Searches all prose tokens and preserves document order inside ranked groups. */
export function searchDocumentIndex(entries: DocumentSearchEntry[], rawQuery: string): DocumentSearchResultGroup[] {
  const query = normalize(rawQuery);
  if (!query) return [];
  const terms = query.split(" ").filter(Boolean);

  const results = entries
    .flatMap((entry, order) => {
      const title = normalize(entry.title);
      const haystack = normalize(`${entry.title} ${entry.addon ?? ""} ${entry.text}`);
      if (!terms.every((term) => haystack.includes(term))) return [];
      const score = title === query ? 0 : title.startsWith(query) ? 1 : title.includes(query) ? 2 : 3;
      const term = matchedTerm(entry.text || entry.title, query, terms);
      return [{ ...entry, matchedTerm: term, score: score * 10_000 + order, snippet: resultSnippet(entry.text, term) }];
    })
    .sort((left, right) => left.score - right.score);

  const groups = new Map<string, DocumentSearchResult[]>();
  for (const result of results) {
    const group = groups.get(result.group) ?? [];
    group.push(result);
    groups.set(result.group, group);
  }
  return [...groups].map(([group, groupedResults]) => ({ group, results: groupedResults }));
}

const excludedHighlightParent = (node: Node) =>
  node.parentElement?.closest("pre, [data-code-block], script, style, [data-api-search-ignore]") !== null;

/** Removes the previous search mark without changing surrounding content nodes. */
export function clearDocumentSearchHighlight(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("mark[data-api-search-highlight]").forEach((mark) => {
    const parent = mark.parentNode;
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
    parent?.normalize();
  });
}

/** Marks only the first matching prose occurrence inside a selected result. */
export function highlightDocumentSearchMatch(target: HTMLElement, rawQuery: string): HTMLElement | null {
  clearDocumentSearchHighlight(target.ownerDocument);
  const query = normalize(rawQuery);
  const terms = query.split(" ").filter(Boolean);
  const walker = target.ownerDocument.createTreeWalker(target, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (excludedHighlightParent(node)) continue;
    const value = node.textContent ?? "";
    const normalizedValue = normalize(value);
    const term = normalizedValue.includes(query)
      ? query
      : terms.find((candidate) => normalizedValue.includes(candidate));
    if (!term) continue;
    const start = normalizedValue.indexOf(term);
    if (start < 0) continue;

    const range = target.ownerDocument.createRange();
    range.setStart(node, start);
    range.setEnd(node, Math.min(value.length, start + term.length));
    const mark = target.ownerDocument.createElement("mark");
    mark.dataset.apiSearchHighlight = "true";
    range.surroundContents(mark);
    return mark;
  }
  return null;
}
