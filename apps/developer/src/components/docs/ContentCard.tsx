/**
 * Structured card primitive for the API reference content area.
 *
 * The compound API keeps the visual hierarchy explicit at call sites while
 * preserving native article, header, footer, and body semantics. Surface
 * geometry and spacing live in docs.css so every consumer shares one card
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
const ContentCardBodyIntro = createCompoundElement("div", "content-card__body-intro");
const ContentCardBodyStack = createCompoundElement("div", "content-card__body-stack");
const ContentCardSection = createCompoundElement("section", "content-card__section");
const ContentCardSectionHeader = createCompoundElement("header", "content-card__section-header");
const ContentCardSectionIcon = createCompoundElement("span", "content-card__section-icon");
const ContentCardSectionTitle = createCompoundElement("h4", "content-card__section-title");
const ContentCardSectionAddon = createCompoundElement("div", "content-card__section-addon");
const ContentCardSectionBody = createCompoundElement("div", "content-card__section-body");
const ContentCardFooter = createCompoundElement("footer", "content-card__footer");

/**
 * Compound card API used by structured technical content.
 *
 * Header, body flow, nested sections, and footer each have one named owner so
 * generated call sites cannot recreate their geometry independently.
 */
export const ContentCard = Object.assign(ContentCardRoot, {
  Header: Object.assign(ContentCardHeader, {
    Addon: ContentCardHeaderAddon,
    Title: ContentCardTitle,
  }),
  Body: Object.assign(ContentCardBody, {
    Intro: ContentCardBodyIntro,
    Stack: ContentCardBodyStack,
    Section: Object.assign(ContentCardSection, {
      Header: Object.assign(ContentCardSectionHeader, {
        Icon: ContentCardSectionIcon,
        Title: ContentCardSectionTitle,
        Addon: ContentCardSectionAddon,
      }),
      Body: ContentCardSectionBody,
    }),
  }),
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
