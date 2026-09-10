/**
 * @file Renders the two stacks and the spacer.
 *
 * A stack carries page content exactly as a card does, so its body goes through
 * marked's own lexer for the same reason: a second Markdown pass with its own
 * rules would render the inside of a stack differently from the outside.
 *
 * What a stack decides reaches CSS as a class rather than as a declaration.
 * Where the arrangement is written into the markup, changing how a stack looks
 * means re-rendering every page that holds one, and the stylesheet is where a
 * design decision belongs. The gap is the exception, because the page names a
 * figure the stylesheet cannot know.
 */

import {
  HSTACK_SHORTCODE,
  HStackAlignment,
  type HStackAlignmentValue,
  parseShortcodes,
  readShortcodeAt,
  type ShortcodeParamValue,
  SPACER_SHORTCODE,
  VSTACK_SHORTCODE,
  VStackAlignment,
  type VStackAlignmentValue,
} from "@musiccloud/shared";
import type { MarkedExtension, Token, Tokens } from "marked";
import { insideContainer, isAtContainerLimit, resolveContainerSpacing } from "./containers.js";

/** The class every stack carries, whichever way it runs. */
const STACK_CLASS = "mc-stack";

/** The class a gap carries. */
const SPACER_CLASS = "mc-spacer";

/** The class a gap carries when it takes whatever room is left. */
const FLEXIBLE_SPACER_CLASS = "mc-spacer--flexible";

/** Which way a stack runs, named as the `flex-direction` it becomes. */
const StackAxis = {
  Vertical: "column",
  Horizontal: "row",
} as const;

/** One of the axes in {@link StackAxis}. */
type StackAxisValue = (typeof StackAxis)[keyof typeof StackAxis];

interface McStackToken extends Tokens.Generic {
  type: "mcStack";
  tokens: Token[];
  axis: StackAxisValue;
  alignment: string;
  /** The gap as CSS, or `null` to let the stylesheet decide. */
  spacing: string | null;
}

interface McSpacerToken extends Tokens.Generic {
  type: "mcSpacer";
  /** The fixed size in pixels, or `null` for one that takes what is left. */
  size: number | null;
}

/**
 * Reads a stack's parameters and its content, if one begins here.
 *
 * @param source - What marked is offering, from the current position.
 * @param axis - Which of the two stacks to look for.
 * @returns The raw source, the content between the braces, and the resolved
 *   parameters, or `null` when the source does not begin with that stack.
 */
function readStackSource(
  source: string,
  axis: StackAxisValue,
): { raw: string; body: string; params: Record<string, ShortcodeParamValue> } | null {
  const definition = axis === StackAxis.Vertical ? VSTACK_SHORTCODE : HSTACK_SHORTCODE;
  const node = readShortcodeAt(source, 0);
  if (!node || node.token !== definition.token || node.body === undefined) return null;

  // Through the parser, so the values the registry declares are the ones that
  // hold here and the defaults are already filled in.
  const [parsed] = parseShortcodes(node.source.raw, [definition]);
  return { raw: node.source.raw, body: node.body, params: parsed?.params ?? {} };
}

/**
 * The alignment a stack was given, as one of the names its registry declares.
 *
 * @param axis - Which of the two stacks this is.
 * @param alignment - What the parser handed back, already checked against the
 *   declared values.
 * @returns The name, falling back to the declared default where the shortcode
 *   did not resolve at all.
 */
function resolveAlignment(axis: StackAxisValue, alignment: ShortcodeParamValue | undefined): string {
  if (typeof alignment === "string") return alignment;
  return axis === StackAxis.Vertical ? VStackAlignment.Leading : HStackAlignment.Center;
}

/**
 * The alignment as it reaches the class name.
 *
 * One pair of names covers both axes, because leading and top are the same edge
 * seen from the two directions, as are trailing and bottom. The stylesheet then
 * carries one set of rules rather than two that say the same thing.
 *
 * @param alignment - The alignment as the registry spells it.
 * @returns The suffix of the class.
 */
function alignmentClassSuffix(alignment: string): string {
  if (alignment === VStackAlignment.Leading || alignment === HStackAlignment.Top) return "start";
  if (alignment === VStackAlignment.Trailing || alignment === HStackAlignment.Bottom) return "end";
  if (alignment === HStackAlignment.FirstTextBaseline) return "baseline";
  return "center";
}

/** The opening of each stack, so the block scanner knows where one may begin. */
const STACK_OPENINGS: readonly { axis: StackAxisValue; opening: RegExp }[] = [
  { axis: StackAxis.Vertical, opening: new RegExp(`\\[\\[${VSTACK_SHORTCODE.token}[\\s{]`) },
  { axis: StackAxis.Horizontal, opening: new RegExp(`\\[\\[${HSTACK_SHORTCODE.token}[\\s{]`) },
];

/**
 * The stacks and the spacer as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createStackExtension(): MarkedExtension {
  return {
    extensions: [
      {
        // One entry for both stacks, because marked resolves a renderer by the
        // extension's name and the two produce the same kind of token. They
        // differ in which way they run and in which alignments they take, and
        // both of those come from the registry.
        name: "mcStack",
        level: "block",
        start(source: string) {
          const found = STACK_OPENINGS.map(({ opening }) => source.match(opening)?.index).filter(
            (index): index is number => index !== undefined,
          );
          return found.length > 0 ? Math.min(...found) : undefined;
        },
        tokenizer(source: string) {
          const axis = STACK_OPENINGS.find(({ opening }) => opening.test(source.slice(0, 12)))?.axis;
          if (!axis) return;

          const read = readStackSource(source, axis);
          if (!read) return;

          // A stack past the limit is left as text, so the source appears on
          // the page and whoever wrote it can see what happened.
          if (isAtContainerLimit()) return;

          return insideContainer(
            () =>
              ({
                type: "mcStack",
                raw: read.raw,
                tokens: this.lexer.blockTokens(read.body) as Token[],
                axis,
                alignment: resolveAlignment(axis, read.params.alignment),
                spacing: resolveContainerSpacing(read.params.spacing),
              }) satisfies McStackToken,
          );
        },
        renderer(token) {
          const stack = token as McStackToken;
          const classes = [
            STACK_CLASS,
            `${STACK_CLASS}--${stack.axis}`,
            `${STACK_CLASS}--${alignmentClassSuffix(stack.alignment)}`,
          ].join(" ");
          const style = stack.spacing ? ` style="gap:${stack.spacing}"` : "";
          return `<div class="${classes}"${style}>${this.parser.parse(stack.tokens)}</div>\n`;
        },
      },
      {
        name: "mcSpacer",
        level: "block",
        start(source: string) {
          return source.match(/\[\[spacer[\s\]]/)?.index;
        },
        tokenizer(source: string) {
          const node = readShortcodeAt(source, 0);
          if (!node || node.token !== SPACER_SHORTCODE.token) return;

          const [parsed] = parseShortcodes(node.source.raw, [SPACER_SHORTCODE]);
          const size = parsed?.params.size;

          return {
            type: "mcSpacer",
            raw: node.source.raw,
            size: typeof size === "number" ? size : null,
          } satisfies McSpacerToken;
        },
        renderer(token) {
          const spacer = token as McSpacerToken;
          // A flexible gap has nothing to write, so it takes a class and lets
          // the stylesheet grow it. A fixed one carries both measurements,
          // because which of them applies depends on the stack around it and
          // the renderer does not know that from here.
          if (spacer.size === null) return `<div class="${SPACER_CLASS} ${FLEXIBLE_SPACER_CLASS}"></div>\n`;
          return `<div class="${SPACER_CLASS}" style="flex-basis:${spacer.size}px;height:${spacer.size}px"></div>\n`;
        },
      },
    ],
  };
}
