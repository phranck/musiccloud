/** Private root component assembled by the public SchemaCard compound. */
import type { ComponentPropsWithoutRef } from "react";
import { ContentCard } from "@/components/docs/ContentCard";
import { joinClassNames } from "@/components/docs/classNames";

type SchemaCardRootProps = ComponentPropsWithoutRef<typeof ContentCard>;

/** Adds the schema-card surface class while preserving ContentCard props. */
export function SchemaCardRoot({ className, ...props }: SchemaCardRootProps) {
  return <ContentCard className={joinClassNames("schema-card", className)} {...props} />;
}
