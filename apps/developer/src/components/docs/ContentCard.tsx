/**
 * Structured card primitive for the API reference content area.
 *
 * The compound API keeps the visual hierarchy explicit at call sites while
 * preserving native article, header, footer, and body semantics. Surface
 * geometry and spacing live in global.css so every consumer shares one card
 * treatment instead of rebuilding individual rounded-card layouts.
 */
import type { ComponentPropsWithoutRef } from "react";
import { createCompoundElement } from "@/components/compoundElement";

type ContentCardProps = ComponentPropsWithoutRef<"article">;
type ContentCardSectionProps = ComponentPropsWithoutRef<"div">;
type ContentCardHeaderProps = ComponentPropsWithoutRef<"header">;
type ContentCardFooterProps = ComponentPropsWithoutRef<"footer">;
type ContentCardTitleProps = ComponentPropsWithoutRef<"h3">;
type ContentCardHeaderAddonProps = ComponentPropsWithoutRef<"div">;

const ContentCardRoot = createCompoundElement("article", "surface-card content-card");
const ContentCardHeader = createCompoundElement("header", "content-card__header");
const ContentCardHeaderAddon = createCompoundElement("div", "content-card__header-addon");
const ContentCardTitle = createCompoundElement("h3", "content-card__title");
const ContentCardBody = createCompoundElement("div", "content-card__body");
const ContentCardFooter = createCompoundElement("footer", "content-card__footer");

/** Compound card API used by the API reference's structured content cards. */
export const ContentCard = Object.assign(ContentCardRoot, {
  Header: Object.assign(ContentCardHeader, {
    Addon: ContentCardHeaderAddon,
  }),
  Title: ContentCardTitle,
  Body: ContentCardBody,
  Footer: ContentCardFooter,
});

export type {
  ContentCardFooterProps,
  ContentCardHeaderAddonProps,
  ContentCardHeaderProps,
  ContentCardProps,
  ContentCardSectionProps,
  ContentCardTitleProps,
};
