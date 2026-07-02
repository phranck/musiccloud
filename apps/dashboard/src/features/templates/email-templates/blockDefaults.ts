import { type EmailBlock, EmailBlockType, type EmailBlockTypeValue } from "@musiccloud/shared";

/** Default height (px) assigned to a freshly added spacer block. */
const DEFAULT_SPACER_HEIGHT_PX = 24;

/**
 * Builds a fresh, empty block of the given type. Used by {@link BlockEditor}'s
 * "+ Block" row to append a new block with sensible starting values — every
 * field is empty/zeroed rather than pre-filled, so the admin always starts
 * from a blank form and the caller can immediately edit the returned block's
 * fields in place.
 *
 * @param type - which {@link EmailBlockType} to create.
 * @returns A new {@link EmailBlock} of the requested type.
 */
export function createDefaultBlock(type: EmailBlockTypeValue): EmailBlock {
  switch (type) {
    case EmailBlockType.Text:
      return { type: EmailBlockType.Text, markdown: "" };
    case EmailBlockType.Button:
      return { type: EmailBlockType.Button, label: "", url: "" };
    case EmailBlockType.Image:
      return { type: EmailBlockType.Image, assetId: "", altText: "" };
    case EmailBlockType.Divider:
      return { type: EmailBlockType.Divider };
    case EmailBlockType.Spacer:
      return { type: EmailBlockType.Spacer, heightPx: DEFAULT_SPACER_HEIGHT_PX };
  }
}
