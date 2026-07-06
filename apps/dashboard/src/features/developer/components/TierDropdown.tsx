import { useMemo } from "react";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { useI18n } from "@/context/I18nContext";
import { useTiers } from "@/features/developer/hooks/useDeveloperData";

/**
 * Sentinel option value representing "no tier assigned". The shared
 * {@link Dropdown} is string-typed, so `null` is mapped to this empty-string
 * value at the component boundary and back in `onChange`.
 */
const NO_TIER_VALUE = "";

interface TierDropdownProps {
  /** Currently assigned tier id, or `null` when the account has no tier. */
  value: string | null;
  /** Called with the newly selected tier id, or `null` when "no tier" is chosen. */
  onChange: (tierId: string | null) => void;
  /** Accessible name for the trigger (the surrounding form renders the visible label). */
  "aria-label"?: string;
}

/**
 * Small round swatch showing a tier's accent colour inside the dropdown
 * options — the same visual used in the tiers table's name cell.
 */
function TierColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="size-3 shrink-0 rounded-full border border-[var(--ds-border)]"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

/**
 * Tier picker for assigning a tier to a developer account (MC-100).
 *
 * Offers every **enabled** tier (sorted by `sortOrder`, each with its colour
 * swatch) plus an explicit "no tier" option. When the current assignment
 * points at a tier that has since been disabled, that tier stays visible as
 * the selected option — marked with an "(inactive)" suffix — so the admin
 * sees the real state, but disabled tiers are never offered for new
 * assignment (the backend enforces this too).
 *
 * @param value - Currently assigned tier id, or `null`.
 * @param onChange - Receives the picked tier id, or `null` for "no tier".
 */
export function TierDropdown({ value, onChange, "aria-label": ariaLabel }: TierDropdownProps) {
  const { messages } = useI18n();
  const dm = messages.developer;
  const { data: tiers } = useTiers();

  const options = useMemo<DropdownOption[]>(() => {
    const opts: DropdownOption[] = [{ value: NO_TIER_VALUE, label: dm.tierNone }];
    const sorted = (tiers ?? []).toSorted((a, b) => a.sortOrder - b.sortOrder);
    for (const tier of sorted) {
      if (tier.enabled) {
        opts.push({ value: tier.id, label: tier.name, icon: <TierColorSwatch color={tier.color} /> });
      } else if (tier.id === value) {
        // Keep the currently assigned but meanwhile disabled tier visible as
        // the selected option; it is intentionally absent otherwise.
        opts.push({
          value: tier.id,
          label: `${tier.name} ${dm.tierDropdownInactiveSuffix}`,
          icon: <TierColorSwatch color={tier.color} />,
        });
      }
    }
    return opts;
  }, [tiers, value, dm]);

  return (
    <Dropdown
      value={value ?? NO_TIER_VALUE}
      onChange={(v) => onChange(v === NO_TIER_VALUE ? null : v)}
      options={options}
      placeholder={dm.tierNone}
      aria-label={ariaLabel ?? dm.colTier}
    />
  );
}
