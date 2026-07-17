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
  const displayShortcut = shortcut.toLowerCase() === "esc" ? "⎋" : shortcut;
  const keyOccurrences = new Map<string, number>();
  const keys: Array<{ id: string; label: string }> = [];
  for (const key of displayShortcut) {
    if (!key.trim()) continue;
    const label = key.toUpperCase();
    const occurrence = (keyOccurrences.get(label) ?? 0) + 1;
    keyOccurrences.set(label, occurrence);
    keys.push({ id: `${label}-${occurrence}`, label });
  }

  return (
    <kbd {...props} aria-label={props["aria-label"] ?? shortcut} className={joinClassNames("keycap", className)}>
      {keys.map((key) => (
        <span key={key.id} className="keycap__key">
          {key.label}
        </span>
      ))}
    </kbd>
  );
}
