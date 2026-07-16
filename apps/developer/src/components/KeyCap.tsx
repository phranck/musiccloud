/**
 * Reusable keyboard-hint component.
 *
 * `KeyCap` keeps a shortcut as one semantic `<kbd>` while its individual
 * glyphs render in separate square keys.
 */
import type { ComponentPropsWithoutRef } from "react";
import { joinClassNames } from "@/components/docs/classNames";

type KeyCapProps = Omit<ComponentPropsWithoutRef<"kbd">, "children"> & {
  shortcut: string;
};

/** A semantic keyboard shortcut whose glyphs are individually keyed. */
export function KeyCap({ className, shortcut, ...props }: KeyCapProps) {
  const keys: string[] = [];
  for (const key of shortcut) {
    if (key.trim()) keys.push(key);
  }

  return (
    <kbd {...props} aria-label={props["aria-label"] ?? shortcut} className={joinClassNames("keycap", className)}>
      {keys.map((key, index) => <span key={`${key}-${index}`} className="keycap__key">{key}</span>)}
    </kbd>
  );
}
