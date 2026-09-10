/**
 * @file The editor's shortcode reference, rendered from the registry.
 *
 * Everything here comes from `SHORTCODE_DEFINITIONS` and `SITE_VARIABLES`.
 * Nothing about a shortcode is written twice, so one added tomorrow appears in
 * this panel without anybody remembering to add it, and a default changed in
 * the registry changes what this promises.
 */

import {
  CODE_FENCE_LANGUAGES,
  SHORTCODE_DEFINITIONS,
  type ShortcodeDefinition,
  type ShortcodeParamDefinition,
  ShortcodeParamType,
  ShortcodeSyntax,
  type ShortcodeTable,
  ShortcodeTargetRule,
  SITE_VARIABLE_NAMES,
  SITE_VARIABLES,
} from "@musiccloud/shared";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import * as React from "react";

/** How long the copy button says it copied before going back. */
const COPY_FEEDBACK_MS = 1500;

/**
 * Lengths already measured, keyed by the CSS they were written as.
 *
 * A measurement costs a layout, and the panel would otherwise take one per
 * parameter on every render. The values cannot change whilst the page is open,
 * because the stylesheet that decides them is loaded once.
 */
const pixelCache = new Map<string, string>();

/**
 * Resolves a CSS length to pixels, by asking the page.
 *
 * A default that lives in the stylesheet is named in the registry by its custom
 * property rather than by its value, so the reference cannot hold a second copy
 * of a figure the design owns. This is what turns the property back into a
 * number, and it reports pixels whatever unit the token is written in.
 *
 * @param value - Any CSS length, such as `var(--ds-space-sm)`.
 * @returns The length in pixels, or `null` where there is no document to ask or
 *   the property resolves to nothing.
 */
function resolveLengthInPixels(value: string): string | null {
  const cached = pixelCache.get(value);
  if (cached) return cached;
  if (typeof document === "undefined") return null;

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = value;
  document.body.appendChild(probe);
  const width = window.getComputedStyle(probe).width;
  probe.remove();

  // `auto` means the custom property is not set, so the name is shown instead
  // of a figure that would be wrong.
  if (width === "auto" || width === "") return null;
  pixelCache.set(value, width);
  return width;
}

/**
 * Whether a default names a custom property rather than stating a value.
 *
 * @param value - The `defaultLabel` as the registry carries it.
 * @returns Whether it should be measured against the page.
 */
function isCssToken(value: string): boolean {
  return value.startsWith("var(--");
}

/**
 * States what holds when a parameter is left out.
 *
 * @param param - The parameter.
 * @returns The phrase to show, or `null` where the parameter has no default.
 */
function describeDefault(param: ShortcodeParamDefinition): string | null {
  if (param.defaultLabel) {
    if (!isCssToken(param.defaultLabel)) return param.defaultLabel;
    return resolveLengthInPixels(param.defaultLabel) ?? param.defaultLabel;
  }

  if (param.defaultValue === undefined) return null;
  if (param.defaultValue === "") return "empty";
  return String(param.defaultValue);
}

/**
 * Describes what a parameter accepts, in one short phrase.
 *
 * @param param - The parameter.
 * @returns The phrase for the type column.
 */
function describeType(param: ShortcodeParamDefinition): string {
  if (param.type === ShortcodeParamType.Enum && param.values) return param.values.join(" | ");
  if (param.type === ShortcodeParamType.Integer) {
    if (param.min !== undefined && param.max !== undefined) return `number, ${param.min} to ${param.max}`;
    return "number";
  }
  if (param.type === ShortcodeParamType.Boolean) return "switch, written without a value";
  return "text";
}

/**
 * Writes a shortcode the way an author types it.
 *
 * The three notations look nothing alike, so showing one of them for all three
 * would be a false instruction rather than a shorthand.
 *
 * @param definition - The shortcode.
 * @returns Its opening form, as source.
 */
function notationFor(definition: ShortcodeDefinition): string {
  if (definition.syntax === ShortcodeSyntax.Fence) return `:::${definition.token}`;
  if (definition.syntax === ShortcodeSyntax.Braces) return "{{…}}";
  if (definition.target === ShortcodeTargetRule.Required) return `[[${definition.token}:…]]`;
  return `[[${definition.token}]]`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true));
      }}
      className="inline-flex h-6 items-center gap-1 rounded-control border border-[var(--ds-border)] px-2 text-[0.6875rem] text-[var(--ds-text-muted)] transition-colors hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
    >
      {copied ? (
        <CheckIcon weight="bold" aria-hidden className="size-3" />
      ) : (
        <CopyIcon weight="duotone" aria-hidden className="size-3" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ParamRow({ param }: { param: ShortcodeParamDefinition }) {
  const fallback = describeDefault(param);

  return (
    <tr className="border-t border-[var(--ds-border-subtle)] align-top">
      <td className="whitespace-nowrap py-1 pr-3 font-mono text-[var(--ds-text)]">
        {param.name}
        {param.required && (
          <span className="ml-0.5 text-[var(--ds-danger-text)]" title="Required">
            *
          </span>
        )}
      </td>
      <td className="py-1 pr-3 text-[var(--ds-text-muted)]">{param.label ?? ""}</td>
      <td className="py-1 font-mono text-[0.9em] text-[var(--ds-text-subtle)]">
        {describeType(param)}
        {param.aliases && param.aliases.length > 0 && <span className="ml-2">also: {param.aliases.join(", ")}</span>}
        {/* What holds without the parameter goes on its own line, because it
            answers a different question from what the parameter accepts. */}
        {fallback && <span className="block">without it: {fallback}</span>}
      </td>
    </tr>
  );
}

function ValueTable({ caption, columns, rows }: ShortcodeTable) {
  return (
    <div className="mt-3">
      <div className="text-[0.6875rem] text-[var(--ds-text-subtle)]">{caption}</div>
      <table className="mt-1 w-full border-collapse text-[0.6875rem]">
        <thead>
          <tr className="text-left text-[var(--ds-text-subtle)]">
            {columns.map((column) => (
              <th key={column} className="py-1 pr-3 font-normal">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("|")} className="border-t border-[var(--ds-border-subtle)] align-top">
              {row.map((cell, column) => (
                <td
                  key={columns[column] ?? String(column)}
                  className={
                    column === 0 ? "py-1 pr-3 font-mono text-[var(--ds-text)]" : "py-1 pr-3 text-[var(--ds-text-muted)]"
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One shortcode, with its children indented beneath it.
 *
 * The nesting is drawn rather than described, because somebody looking for a
 * name that only works inside another one needs to see where it lives.
 *
 * @param props.definition - The shortcode to describe.
 * @param props.depth - How far in it sits, which decides how it is set off.
 * @returns The entry.
 */
export function ShortcodeEntry({ definition, depth }: { definition: ShortcodeDefinition; depth: number }) {
  return (
    <div
      className={
        depth > 0
          ? "mt-3 border-l border-[var(--ds-border-subtle)] pl-3"
          : "mt-4 border-t border-[var(--ds-border-subtle)] pt-4 first:mt-0 first:border-t-0 first:pt-0"
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <code className="font-mono text-xs font-semibold text-[var(--ds-text)]">{notationFor(definition)}</code>
        <span className="text-[0.6875rem] text-[var(--ds-text-muted)]">{definition.label}</span>
      </div>
      <p className="mt-1 text-[0.6875rem] leading-snug text-[var(--ds-text-muted)]">{definition.description}</p>

      {definition.params.length > 0 && (
        <table className="mt-2 w-full border-collapse text-[0.6875rem]">
          <tbody>
            {definition.params.map((param) => (
              <ParamRow key={param.name} param={param} />
            ))}
          </tbody>
        </table>
      )}

      {definition.tables?.map((table) => (
        <ValueTable key={table.caption} caption={table.caption} columns={table.columns} rows={table.rows} />
      ))}

      {definition.examples.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[0.6875rem] text-[var(--ds-text-subtle)]">
              {definition.examples.length === 1 ? "Example" : "Examples"}
            </span>
            <CopyButton text={definition.examples.join("\n\n")} />
          </div>
          {/* The block scrolls inside itself, because a `pre` reports its
              longest line as its minimum width and would widen the panel. */}
          <pre className="m-0 overflow-x-auto rounded-control border border-[var(--ds-border-subtle)] bg-[var(--ds-input-bg)] p-2 text-[0.6875rem] leading-relaxed">
            <code className="font-mono">{definition.examples.join("\n\n")}</code>
          </pre>
        </div>
      )}

      {definition.children?.map((child) => (
        <ShortcodeEntry key={child.token} definition={child} depth={depth + 1} />
      ))}
    </div>
  );
}

/**
 * Every shortcode a page may use, described from the registry.
 *
 * @param props.definitions - What to describe. Defaults to the whole registry,
 *   which is what the editor wants; a caller passes its own only to describe a
 *   narrower set, such as the shortcodes one content context allows.
 * @returns The list, in the order it is declared.
 */
export function ShortcodeList({
  definitions = SHORTCODE_DEFINITIONS,
}: {
  definitions?: readonly ShortcodeDefinition[];
} = {}) {
  return (
    <div>
      {definitions.map((definition) => (
        <ShortcodeEntry key={`${definition.syntax}:${definition.token}`} definition={definition} depth={0} />
      ))}
    </div>
  );
}

/**
 * What a fenced code block can be told to do.
 *
 * Not a shortcode: this is Markdown's own syntax with our modifiers on its
 * info string, so it lives beside the registry rather than in it. A writer
 * types it all the same, which is why the reference describes it.
 */
const CODE_FENCE_EXAMPLES = [
  {
    label: "Default code block",
    code: "```js\nconst value = 1;\n```",
    description: "Renders as a recessed card with syntax highlighting.",
  },
  {
    label: "Explicit recessed / embossed",
    code: "```js recessed\nconst value = 1;\n```\n\n```js embossed\nconst value = 1;\n```",
    description: "Use the modifier after the language to choose the card surface.",
  },
  {
    label: "Custom spacing",
    code: "```js recessed padding=1rem radius=12px\nconst value = 1;\n```",
    description: "padding= and radius= override what the card geometry would otherwise give the block.",
  },
  {
    label: "Plain text comments",
    code: "```text\n# comment\n// note\nplain line\n```",
    description: "# and // at the start of a text line render as muted italic comments.",
  },
  {
    label: "musiccloud query",
    code: "```mc-query\ngenre: jazz | soul\ntracks: 20\n# internal note\n```",
    description: "Highlights query keys, numbers, |, ?, and # / // comments.",
  },
] satisfies { label: string; code: string; description: string }[];

/**
 * The fenced code block and its modifiers.
 *
 * @returns The examples, each with what it produces, and every language the
 *   highlighter loads.
 */
export function CodeFenceReference() {
  return (
    <section>
      <header>
        <h3 className="text-[0.875rem] font-semibold text-[var(--ds-text)]">Code blocks</h3>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--ds-text-subtle)]">
          Three backticks open a block. What follows them on the same line is the language, and after that the surface
          it sits on and the space around it.
        </p>
      </header>

      <div className="mt-3 grid gap-2">
        {CODE_FENCE_EXAMPLES.map((example) => (
          <article key={example.label}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="text-[0.6875rem] font-medium text-[var(--ds-text)]">{example.label}</h4>
              <CopyButton text={example.code} />
            </div>
            <pre className="m-0 overflow-x-auto rounded-control border border-[var(--ds-border-subtle)] bg-[var(--ds-input-bg)] p-2 text-[0.6875rem] leading-relaxed">
              <code className="font-mono">{example.code}</code>
            </pre>
            <p className="mt-1 text-[0.6875rem] leading-snug text-[var(--ds-text-muted)]">{example.description}</p>
          </article>
        ))}
      </div>

      <h4 className="mt-4 text-[0.6875rem] text-[var(--ds-text-subtle)]">Languages that are highlighted</h4>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {CODE_FENCE_LANGUAGES.map((language) => (
          <code
            key={language}
            className="rounded border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] px-1 py-0.5 font-mono text-[0.6875rem] text-[var(--ds-text-muted)]"
          >
            {language}
          </code>
        ))}
      </div>
    </section>
  );
}

/**
 * Every figure a page may name, described from the variable declarations.
 *
 * Variables sit beside the shortcodes rather than in a place of their own,
 * because from the writer's side they answer the same question: what may I type
 * here that turns into something else.
 *
 * @returns The list, in declaration order.
 */
export function SiteVariableList() {
  return (
    <table className="w-full border-collapse text-[0.6875rem]">
      <thead>
        <tr className="text-left text-[var(--ds-text-subtle)]">
          <th className="py-1 pr-3 font-normal">Name</th>
          <th className="py-1 pr-3 font-normal">What it is</th>
          <th className="py-1 font-normal">Looks like</th>
        </tr>
      </thead>
      <tbody>
        {SITE_VARIABLE_NAMES.map((name) => (
          <tr key={name} className="border-t border-[var(--ds-border-subtle)] align-top">
            <td className="whitespace-nowrap py-1 pr-3 font-mono text-[var(--ds-text)]">{`{${name}}`}</td>
            <td className="py-1 pr-3 text-[var(--ds-text-muted)]">{SITE_VARIABLES[name].label}</td>
            <td className="whitespace-nowrap py-1 font-mono text-[var(--ds-text-subtle)]">
              {SITE_VARIABLES[name].example}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
