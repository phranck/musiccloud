import type { EmailBlock, EmailVariableMeta } from "@musiccloud/shared";

import type { useI18n } from "@/context/I18nContext";
import {
  type BoundActionVariables,
  buildVariablesPanelModel,
  splitDetectedVariables,
} from "@/features/templates/email-templates/variablesPanelModel";

/** This feature's i18n message block (mirrors `EmailTemplateEditPage`'s `labels` prop convention). */
type EmailTemplatesLabels = ReturnType<typeof useI18n>["messages"]["emailTemplates"];

export interface VariablesPanelProps {
  /** The template's subject line (scanned for used placeholders). */
  subject: string;
  /** The template's ordered body blocks (scanned for used placeholders). */
  blocks: EmailBlock[];
  /** Recipient kind + context variables of every action the template is bound to; empty when unbound. */
  boundActions: readonly BoundActionVariables[];
  /** Called with the bare variable name when an available-variable chip is clicked. */
  onInsert: (name: string) => void;
  labels: EmailTemplatesLabels;
}

/**
 * The template editor's variables panel (MC-081): offers every catalog
 * variable available to this template as a click-to-insert chip, grouped by
 * scope (system / recipient / action context), and below that shows which
 * placeholders the template currently uses — flagging unknown names (typos or
 * variables of actions the template is not bound to) as warnings.
 *
 * All derivation lives in `variablesPanelModel.ts`; this component only
 * renders. Insertion routing (subject input vs. a focused Markdown editor) is
 * the page's job via `onInsert`.
 */
export function VariablesPanel({ subject, blocks, boundActions, onInsert, labels }: VariablesPanelProps) {
  const model = buildVariablesPanelModel(boundActions);
  const detected = splitDetectedVariables(subject, blocks, model.availableNames);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--ds-text-muted)]">{labels.variablesInsertHint}</p>

      <VariableGroup title={labels.variablesGroupSystem} variables={model.system} onInsert={onInsert} />
      <VariableGroup title={labels.variablesGroupRecipient} variables={model.recipient} onInsert={onInsert} />
      {model.context.length > 0 ? (
        <VariableGroup title={labels.variablesGroupContext} variables={model.context} onInsert={onInsert} />
      ) : (
        <div className="space-y-1.5">
          <GroupTitle>{labels.variablesGroupContext}</GroupTitle>
          <p className="text-xs text-[var(--ds-text-subtle)]">{labels.variablesContextUnbound}</p>
        </div>
      )}

      <DetectedVariables detected={detected} labels={labels} />
    </div>
  );
}

/** Tiny uppercase group heading shared by all three scope groups. */
function GroupTitle({ children }: { children: string }) {
  return (
    <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">{children}</h4>
  );
}

interface VariableGroupProps {
  title: string;
  variables: EmailVariableMeta[];
  onInsert: (name: string) => void;
}

/** One scope group: heading plus a wrapping row of click-to-insert chips. */
function VariableGroup({ title, variables, onInsert }: VariableGroupProps) {
  return (
    <div className="space-y-1.5">
      <GroupTitle>{title}</GroupTitle>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((meta) => (
          <button
            key={meta.name}
            type="button"
            title={`${meta.description} — ${meta.sampleValue}`}
            onClick={() => onInsert(meta.name)}
            className="rounded-control border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2 py-0.5 font-mono text-xs text-[var(--ds-text)] transition-colors hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-control-hover-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            {`{{${meta.name}}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

interface DetectedVariablesProps {
  detected: { known: string[]; unknown: string[] };
  labels: EmailTemplatesLabels;
}

/**
 * Read-only display of the placeholders the template currently uses, split
 * into offered names (neutral chips) and unknown names (danger chips plus a
 * warning line). Live-updates as the subject and blocks change.
 */
function DetectedVariables({ detected, labels }: DetectedVariablesProps) {
  const isEmpty = detected.known.length === 0 && detected.unknown.length === 0;

  return (
    <div className="space-y-1.5 border-t border-[var(--ds-border-subtle)] pt-3">
      <GroupTitle>{labels.variablesDetectedTitle}</GroupTitle>
      {isEmpty ? (
        <p className="text-xs text-[var(--ds-text-muted)]">{labels.variablesDetectedEmpty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {detected.known.map((name) => (
            <span
              key={name}
              className="rounded-control border border-[var(--ds-border)] bg-[var(--ds-surface-inset)] px-2 py-0.5 font-mono text-xs text-[var(--ds-text)]"
            >
              {`{{${name}}}`}
            </span>
          ))}
          {detected.unknown.map((name) => (
            <span
              key={name}
              className="rounded-control bg-[var(--ds-danger-bg)] px-2 py-0.5 font-mono text-xs text-[var(--ds-danger-text)]"
            >
              {`{{${name}}}`}
            </span>
          ))}
        </div>
      )}
      {detected.unknown.length > 0 && (
        <p className="text-xs text-[var(--ds-danger-text)]">{labels.variablesUnknownWarning}</p>
      )}
    </div>
  );
}
