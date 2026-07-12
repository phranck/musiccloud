/**
 * Shared semantic surface compound for public, authentication, and dashboard
 * content. The outer recipe owns geometry while Header, Body, and Footer keep
 * section semantics explicit at every call site.
 */
import type { ComponentPropsWithoutRef } from "react";
import { createCompoundElement } from "@/components/compoundElement";

type SurfaceCardProps = ComponentPropsWithoutRef<"article">;
type SurfaceCardHeaderProps = ComponentPropsWithoutRef<"header">;
type SurfaceCardBodyProps = ComponentPropsWithoutRef<"div">;
type SurfaceCardFooterProps = ComponentPropsWithoutRef<"footer">;

const SurfaceCardRoot = createCompoundElement("article", "surface-card");
const SurfaceCardHeader = createCompoundElement("header", "surface-card__header");
const SurfaceCardBody = createCompoundElement("div", "surface-card__body");
const SurfaceCardFooter = createCompoundElement("footer", "surface-card__footer");

/** Compound surface API shared across Developer Portal domains. */
export const SurfaceCard = Object.assign(SurfaceCardRoot, {
  Header: SurfaceCardHeader,
  Body: SurfaceCardBody,
  Footer: SurfaceCardFooter,
});

export type { SurfaceCardBodyProps, SurfaceCardFooterProps, SurfaceCardHeaderProps, SurfaceCardProps };
