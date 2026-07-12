/**
 * Shared Iconsax symbols for API reference sections.
 *
 * Keeping this mapping outside the navigation ensures that a section always
 * has the same visual cue in the sidebar and in its content heading.
 */
import {
  BookIcon,
  CategoryIcon,
  CodeIcon,
  DiagramIcon,
  GlobalIcon,
  HealthIcon,
  LinkIcon,
  ProfileIcon,
} from "@/lib/icons";

export const apiReferenceStaticSectionIcons = {
  integration: BookIcon,
  sdk: CodeIcon,
  schemas: CodeIcon,
} as const;

/** Expands the abbreviated public tag only in human-facing reference labels. */
export const apiReferenceSectionLabel = (name: string) =>
  name.trim().toLowerCase() === "cc" ? "Creative Commons" : name;

/** Maps generated OpenAPI groups to concise, semantically useful icons. */
export const iconForApiReferenceSection = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("artist")) return ProfileIcon;
  if (normalized.includes("creative commons") || normalized === "cc") return GlobalIcon;
  if (normalized.includes("health")) return HealthIcon;
  if (normalized.includes("link")) return LinkIcon;
  if (normalized.includes("resolve")) return DiagramIcon;
  if (normalized.includes("other")) return CategoryIcon;
  return CodeIcon;
};
