/**
 * Fully normalized modal search surface for document-wide API reference search.
 *
 * The compound owns semantic dialog/listbox structure and stable class recipes;
 * query state, indexing, keyboard navigation, and selection stay in the
 * `ApiDocumentSearch` controller.
 */
import {
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  createElement,
  type JSX,
} from "react";
import { joinClassNames } from "@/components/docs/classNames";

/** Creates a class-bound search-dialog slot with native prop passthrough. */
function slot<Tag extends keyof JSX.IntrinsicElements>(tag: Tag, baseClassName: string) {
  type Props = ComponentPropsWithoutRef<Tag> & { className?: string };
  const Slot = ({ className, ...props }: Props) =>
    createElement(tag, { ...props, className: joinClassNames(baseClassName, className) });
  Slot.displayName = `SearchDialogSlot(${tag}.${baseClassName})`;
  return Slot;
}

function SearchDialogRoot({ className, ...props }: ComponentPropsWithRef<"dialog">) {
  return <dialog {...props} className={joinClassNames("search-dialog surface-card", className)} />;
}

const SearchDialogHeader = slot("header", "search-dialog__header");
const SearchDialogHeaderTitle = slot("h2", "search-dialog__header-title");
const SearchDialogHeaderSearch = slot("div", "search-dialog__header-search");
const SearchDialogHeaderSearchIcon = slot("span", "search-dialog__header-search-icon");
const SearchDialogHeaderAddon = slot("div", "search-dialog__header-addon");
const SearchDialogBody = slot("div", "search-dialog__body");
const SearchDialogBodyStatus = slot("p", "search-dialog__status");
const SearchDialogGroup = slot("section", "search-dialog__group");
const SearchDialogGroupHeader = slot("header", "search-dialog__group-header");
const SearchDialogGroupHeaderTitle = slot("h3", "search-dialog__group-header-title");
const SearchDialogGroupHeaderAddon = slot("span", "search-dialog__group-header-addon");
const SearchDialogGroupItems = slot("div", "search-dialog__group-items");
const SearchDialogResultIcon = slot("span", "search-dialog__result-icon icon-text-first-line__icon");
const SearchDialogResultContent = slot("span", "search-dialog__result-content");
const SearchDialogResultTitle = slot("span", "search-dialog__result-title");
const SearchDialogResultSnippet = slot("span", "search-dialog__result-snippet");
const SearchDialogResultAddon = slot("span", "search-dialog__result-addon");
const SearchDialogEmpty = slot("div", "search-dialog__empty");
const SearchDialogFooter = slot("footer", "search-dialog__footer");
const SearchDialogFooterHints = slot("div", "search-dialog__footer-hints");
const SearchDialogFooterHint = slot("span", "search-dialog__footer-hint");

function SearchDialogHeaderSearchInput({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input {...props} type="search" className={joinClassNames("search-dialog__header-search-input", className)} />;
}

function SearchDialogHeaderSearchClear({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} type="button" className={joinClassNames("search-dialog__header-search-clear", className)} />
  );
}

function SearchDialogHeaderClose({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" className={joinClassNames("search-dialog__header-close", className)} />;
}

function SearchDialogResults({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div {...props} role="listbox" className={joinClassNames("search-dialog__results", className)} />;
}

function SearchDialogResult({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" className={joinClassNames("search-dialog__result", className)} />;
}

/** Complete modal search compound API. */
export const SearchDialog = Object.assign(SearchDialogRoot, {
  Header: Object.assign(SearchDialogHeader, {
    Title: SearchDialogHeaderTitle,
    Search: Object.assign(SearchDialogHeaderSearch, {
      Icon: SearchDialogHeaderSearchIcon,
      Input: SearchDialogHeaderSearchInput,
      Clear: SearchDialogHeaderSearchClear,
    }),
    Addon: SearchDialogHeaderAddon,
    Close: SearchDialogHeaderClose,
  }),
  Body: Object.assign(SearchDialogBody, {
    Status: SearchDialogBodyStatus,
  }),
  Results: SearchDialogResults,
  Group: Object.assign(SearchDialogGroup, {
    Header: Object.assign(SearchDialogGroupHeader, {
      Title: SearchDialogGroupHeaderTitle,
      Addon: SearchDialogGroupHeaderAddon,
    }),
    Items: SearchDialogGroupItems,
  }),
  Result: Object.assign(SearchDialogResult, {
    Icon: SearchDialogResultIcon,
    Content: SearchDialogResultContent,
    Title: SearchDialogResultTitle,
    Snippet: SearchDialogResultSnippet,
    Addon: SearchDialogResultAddon,
  }),
  Empty: SearchDialogEmpty,
  Footer: Object.assign(SearchDialogFooter, {
    Hints: SearchDialogFooterHints,
    Hint: SearchDialogFooterHint,
  }),
});
