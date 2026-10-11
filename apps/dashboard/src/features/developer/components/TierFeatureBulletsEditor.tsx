import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
  Plus as PlusIcon,
  Trash as TrashIcon,
} from "@phosphor-icons/react";
import type { dashboardCopy } from "@/copy/dashboard";
import { type FormFeatureBullet, MAX_FEATURES, nextFeatureId } from "@/features/developer/featureBullets";
import { FormLabelText, formInputClass } from "@/shared/ui/FormPrimitives";

interface TierFeatureBulletsEditorProps {
  /** Current ordered list of feature bullets (with local stable ids). */
  features: FormFeatureBullet[];
  /** Invoked with a new copy of the list whenever the user makes a change. */
  onChange: (features: FormFeatureBullet[]) => void;
  /** Localized labels for the editor controls. */
  dm: (typeof dashboardCopy)["developer"];
}

/**
 * Inline editor for the ordered feature labels list of a tier.
 *
 * Renders each feature as a row containing a text input for the label plus
 * up/down reorder buttons and a remove button. An "Add feature" button appends
 * a new empty row; it is disabled once the maximum of 12 is reached.
 *
 * @param features - The current ordered list of feature rows (with local stable ids).
 * @param onChange - Called with a new list whenever the user edits, adds, reorders, or removes a row.
 * @param dm - Developer section of the localized dashboard messages.
 */
export function TierFeatureBulletsEditor({ features, onChange, dm }: TierFeatureBulletsEditorProps) {
  function handleLabelChange(id: string, label: string) {
    onChange(features.map((f) => (f.id === id ? { ...f, label } : f)));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...features];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  }

  function handleMoveDown(index: number) {
    if (index === features.length - 1) return;
    const next = [...features];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  }

  function handleRemove(id: string) {
    onChange(features.filter((f) => f.id !== id));
  }

  function handleAdd() {
    if (features.length >= MAX_FEATURES) return;
    onChange([...features, { id: nextFeatureId(), label: "" }]);
  }

  const atMax = features.length >= MAX_FEATURES;

  return (
    <div>
      <FormLabelText>{dm.featuresLabel}</FormLabelText>

      {features.length > 0 && (
        <ul className="mt-1 space-y-1.5">
          {features.map((feature, index) => (
            <li key={feature.id} className="flex items-center gap-2">
              {/* Label input */}
              <input
                type="text"
                aria-label={`${dm.featuresLabel} ${index + 1}`}
                className={`${formInputClass} flex-1`}
                value={feature.label}
                onChange={(e) => handleLabelChange(feature.id, e.target.value)}
                maxLength={80}
                placeholder={dm.featureLabelPlaceholder}
              />

              {/* Reorder buttons */}
              <button
                type="button"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                aria-label={dm.featureMoveUp}
                className="flex size-7 shrink-0 items-center justify-center rounded border border-[var(--ds-border)] text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg-elevated)] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)]"
              >
                <ArrowUpIcon weight="bold" className="size-3" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => handleMoveDown(index)}
                disabled={index === features.length - 1}
                aria-label={dm.featureMoveDown}
                className="flex size-7 shrink-0 items-center justify-center rounded border border-[var(--ds-border)] text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg-elevated)] disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)]"
              >
                <ArrowDownIcon weight="bold" className="size-3" aria-hidden />
              </button>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => handleRemove(feature.id)}
                aria-label={dm.featureRemove}
                className="flex size-7 shrink-0 items-center justify-center rounded border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)]"
              >
                <TrashIcon weight="duotone" className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={handleAdd}
          disabled={atMax}
          className="inline-flex items-center gap-1.5 rounded border border-[var(--ds-border)] px-2.5 py-1 text-xs font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg-elevated)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)]"
        >
          <PlusIcon weight="bold" className="size-3" aria-hidden />
          {dm.featureAddButton}
        </button>
        {atMax && <p className="text-xs text-amber-400">{dm.featureMaxReached}</p>}
      </div>
    </div>
  );
}
