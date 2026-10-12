import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { MagnifyingGlass as MagnifyingGlassIcon, XCircle as XCircleIcon } from "@phosphor-icons/react";

import { dashboardCopy } from "@/copy/dashboard";

/** Props for {@link AdminListSearchField}. */
interface AdminListSearchFieldProps {
  /** The text typed so far, which `useInfiniteAdminTable` holds as `searchInput`. */
  value: string;
  /** Receives every change, including the empty text the clear button sends. */
  onChange: (value: string) => void;
  /** What the list searches, such as "Search tracks…". It also names the field for assistive technology. */
  placeholder: string;
}

/**
 * The search field in the page header of a paged admin list.
 *
 * It only edits the text. `useInfiniteAdminTable` waits for typing to pause
 * and then asks the server for the first page of the matching rows, so the
 * field never filters anything itself. Once there is text, a clear button sits
 * inside the field's right edge.
 *
 * @param props - See {@link AdminListSearchFieldProps}.
 * @returns The field with its search icon and clear button.
 */
export function AdminListSearchField({ value, onChange, placeholder }: AdminListSearchFieldProps) {
  return (
    <div className="relative">
      <DashboardInput
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-52 pl-8 pr-7"
      />
      <MagnifyingGlassIcon
        weight="duotone"
        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--ds-text-muted)]"
      />
      {value && (
        <DashboardActionButton
          action={DashboardActionId.Close}
          icon={<XCircleIcon weight="duotone" className="size-3.5" />}
          iconOnly
          label={dashboardCopy.common.close}
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 -translate-y-1/2"
          size="action"
          type="button"
        />
      )}
    </div>
  );
}
