import { ContentContext, type ContentContextMask, type SingleContentContext } from "@musiccloud/shared";

import { PageContextOption } from "@/features/content/pages/PageContextOption";
import { PageContextValidationMessage } from "@/features/content/pages/PageContextValidationMessage";

const CONTEXT_OPTIONS = [
  { context: ContentContext.Frontend, label: "Frontend" },
  { context: ContentContext.DeveloperPortal, label: "Developer Portal" },
] as const;

export interface PageContextControlProps {
  value: ContentContextMask;
  blockedContextMask?: ContentContextMask;
  labels?: Partial<Record<SingleContentContext, string>>;
  validationMessage?: string | null;
  onChange: (value: ContentContextMask) => void;
}

export function PageContextControlRoot({
  value,
  blockedContextMask = 0,
  labels,
  validationMessage,
  onChange,
}: PageContextControlProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-6">
        {CONTEXT_OPTIONS.map(({ context, label }) => {
          const checked = (value & context) === context;
          const finalActiveContext = checked && value === context;
          const blockedByDependency = checked && (blockedContextMask & context) === context;
          return (
            <PageContextOption
              key={context}
              checked={checked}
              disabled={finalActiveContext || blockedByDependency}
              label={labels?.[context] ?? label}
              onChange={(enabled) => onChange(enabled ? value | context : value & ~context)}
            />
          );
        })}
      </div>
      {validationMessage && <PageContextValidationMessage>{validationMessage}</PageContextValidationMessage>}
    </div>
  );
}
