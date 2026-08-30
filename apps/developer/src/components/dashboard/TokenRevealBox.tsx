import { useEffect, useRef } from "react";
import { CopyableCode } from "@/components/dashboard/CopyableCode";
import { CloseCircleIcon } from "@/lib/icons";

/**
 * Props for {@link TokenRevealBox}.
 */
export interface TokenRevealBoxProps {
  /** The full secret token, available exactly once. */
  rawToken: string;
  /** Name of the app the token belongs to, for context. */
  appName: string;
  /** Called when the developer dismisses the box. */
  onDismiss: () => void;
}

/**
 * One-time token reveal: shows a freshly created or rotated key with a copy
 * button and an unmissable "shown only once" warning. Focuses itself on mount
 * so a keyboard user lands on the announcement. The key lives only in this
 * component's props, and dismissing the box is final, matching the backend's
 * store-the-hash-only model.
 *
 * @param props - See {@link TokenRevealBoxProps}.
 * @returns The reveal panel.
 */
export function TokenRevealBox({ rawToken, appName, onDismiss }: TokenRevealBoxProps) {
  const boxRef = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  return (
    <output ref={boxRef} tabIndex={-1} className="surface-card block px-5 py-4 outline-none">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-body font-medium text-fg">
          New API key for <span className="text-accent">{appName}</span>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss. The key will not be shown again."
          className="button button--icon text-fg-muted"
        >
          <CloseCircleIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="text-body text-gold mb-3">
        Copy it now. This is the only time the full key is shown: it is stored as a hash, so nobody can read it back,
        not even us. If you lose it, rotate the key from this registration and put the replacement in place.
      </p>
      <CopyableCode code={rawToken} label="the API key" />
    </output>
  );
}
