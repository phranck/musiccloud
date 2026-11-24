/**
 * @file The sponsoring settings: running costs, minimum, payee and remittance texts.
 *
 * Ported from lmaa.space (`apps/dashboard/src/features/content/sponsors/SponsoringSettingsPage.tsx`):
 * the same two columns, the same four cards, the same headers, the same site
 * variables with their copy buttons, and Save in the page header. What is
 * musiccloud's own stays: the form model in `sponsoringForm`, which checks every
 * field the way the backend does, and the rule that only the owner changes the
 * setting, because the payee decides where money goes.
 */

import { DashboardActionButton, DashboardActionId } from "@musiccloud/dashboard-ui";
import { AdminRole, formatEuroCents, type SiteVariableName, SPONSORING_LIMITS } from "@musiccloud/shared";
import { BankIcon, CoinsIcon, MedalIcon, NoteIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { CopyableCode } from "@/components/ui/CopyableCode";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageBody, PageLayout } from "@/components/ui/PageLayout";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import { useAuth } from "@/features/auth/AuthContext";
import { fetchSponsoringConfig, SPONSORING_CONFIG_QUERY_KEY, updateSponsoringConfig } from "@/features/sponsoring/api";
import {
  euroInputToCents,
  newCostRowId,
  type SponsoringForm,
  sponsoringFormProblems,
  toSponsoringConfig,
  toSponsoringForm,
} from "@/features/sponsoring/sponsoringForm";
import { FormLabel, formInputClass } from "@/shared/ui/FormPrimitives";

/** The dashboard's copy. */
const messages = dashboardCopy;
/** The sponsoring screens' copy. */
const sm = messages.sponsoring;

/** Classes of the line under a field: its hint or its site variable. */
const FIELD_HINT_CLASS = "mt-1 text-xs text-[var(--ds-text-muted)]";

/** Props of {@link FieldProblem}. */
interface FieldProblemProps {
  /** Whether the field it belongs to would be refused. */
  shown: boolean;
  /** What is wrong with it. */
  text: string;
}

/**
 * The line under a field that the backend would refuse, in the style the plan
 * editor uses for the same purpose.
 *
 * @param props - See {@link FieldProblemProps}.
 * @returns The line, or nothing while the field is fine.
 */
function FieldProblem({ shown, text }: FieldProblemProps) {
  return shown ? <p className="mt-1 text-xs text-amber-400">{text}</p> : null;
}

/** Props of {@link VariableHint}. */
interface VariableHintProps {
  /** The variable the field publishes, without its braces. */
  name: SiteVariableName;
  /** A sentence that belongs in front of it, where the field has something else to say as well. */
  before?: string;
}

/**
 * The name of a variable a field publishes, ready to be copied, as lmaa.space
 * shows it under each field.
 *
 * @param props - See {@link VariableHintProps}.
 * @returns The hint.
 */
function VariableHint({ name, before }: VariableHintProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {/* Each sentence is its own element, because two text nodes side by side
          are one flex item and the gap between them never appears. */}
      {before && <span>{before}</span>}
      <span>{sm.variableLabel}</span>
      <CopyableCode value={`{${name}}`} copyLabel={messages.common.copy} />
    </span>
  );
}

/** Props of {@link TextField}. */
interface TextFieldProps {
  /** The input's id, which its label points at. */
  id: string;
  /** The label above the input. */
  label: string;
  /** The current value. */
  value: string;
  /** Receives the typed value. */
  onChange: (value: string) => void;
  /** The longest value the backend accepts. Unlimited when absent. */
  maxLength?: number;
  /** Whether the backend would refuse the value. */
  invalid: boolean;
  /** What is wrong when it is refused. */
  invalidText: string;
  /** What stands under the field, such as its site variable. Nothing when absent. */
  hint?: ReactNode;
}

/**
 * One labelled text input with its refusal line and its hint.
 *
 * @param props - See {@link TextFieldProps}.
 * @returns The field.
 */
function TextField({ id, label, value, onChange, maxLength, invalid, invalidText, hint }: TextFieldProps) {
  return (
    <div className="min-w-0">
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <input
        id={id}
        aria-label={label}
        type="text"
        className={formInputClass}
        value={value}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldProblem shown={invalid} text={invalidText} />
      {hint && <div className={FIELD_HINT_CLASS}>{hint}</div>}
    </div>
  );
}

/**
 * The editor of the sponsoring setting, in lmaa.space's arrangement.
 *
 * Two columns. On the left, "Running costs" with the yearly sum in its header
 * and the variables `{annualCost}` and `{monthlyCost}` under the rows, and
 * "Minimum" below it. On the right, "Payee" and "Remittance texts", each field
 * with the site variable it publishes. One Save in the page header stores all
 * four cards at once, because the support page reads them together and a
 * half-saved setting would print one account beside another's purposes.
 *
 * Every admin can read the setting and only the owner can change it; for
 * anybody else the fields and Save are disabled and the page says why. Save
 * stays off until something changed and while any field would be refused, and
 * the server's own message appears beside it if it refuses anyway.
 *
 * @returns The page.
 */
export function SponsoringSettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === AdminRole.Owner;
  const configQuery = useQuery({ queryKey: SPONSORING_CONFIG_QUERY_KEY, queryFn: fetchSponsoringConfig });
  const [draft, setDraft] = useState<SponsoringForm | null>(null);
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: updateSponsoringConfig,
    onSuccess: (next) => {
      queryClient.setQueryData(SPONSORING_CONFIG_QUERY_KEY, next);
      setDraft(null);
      setSaved(true);
    },
  });

  if (configQuery.isLoading || !configQuery.data) return <ContentLoadingView />;

  const form = draft ?? toSponsoringForm(configQuery.data);
  const problems = sponsoringFormProblems(form);
  // The header shows the sum while a row is still being typed, so an amount
  // that does not read as one yet counts as nothing rather than hiding the sum.
  const totalCents = form.costs.reduce((sum, row) => sum + (euroInputToCents(row.amount) ?? 0), 0);
  const atMax = form.costs.length >= SPONSORING_LIMITS.maxCostItems;
  const savable = isOwner && draft !== null && problems.size === 0 && !saveMutation.isPending;

  /**
   * Replaces some of the form's fields.
   *
   * @param patch - The fields to replace.
   */
  function change(patch: Partial<SponsoringForm>) {
    setDraft({ ...form, ...patch });
    setSaved(false);
  }

  return (
    <PageLayout>
      <PageHeader title={sm.settingsTitle}>
        {saveMutation.isError && <SaveErrorMessage error={saveMutation.error} />}
        {/* One button for the page, because the four cards edit one setting and
            one write stores it. */}
        <DashboardActionButton
          action={DashboardActionId.Save}
          label={saved ? messages.common.saved : messages.common.save}
          disabled={!savable}
          type="button"
          onClick={() => saveMutation.mutate(toSponsoringConfig(form))}
        />
      </PageHeader>

      <PageBody className="overflow-y-auto">
        <fieldset disabled={!isOwner} className="grid w-full min-w-0 gap-[var(--ds-space-base)]">
          {!isOwner && <p className="text-sm text-[var(--ds-text-muted)]">{sm.ownerOnly}</p>}

          {/* The items on the left and the payee on the right, because the list
              is read down whilst the fields beside it are read across. The
              `min-w-0` on both columns is what lets them shrink, because a grid
              item is at least as wide as its content. */}
          <div className="grid items-start gap-[var(--ds-space-base)] md:grid-cols-7">
            <div className="grid min-w-0 gap-[var(--ds-space-base)] md:col-span-3">
              <DashboardSection className="overflow-hidden">
                <DashboardSection.Header
                  icon={<CoinsIcon weight="duotone" className="size-4" />}
                  title={sm.costsTitle}
                  // The sum stands in the header's own row rather than under the
                  // title, because it is the answer this card exists to give.
                  renderAddOn={() => (
                    <span className="flex items-center gap-4">
                      <span className="text-sm text-[var(--ds-text-muted)]">{sm.costsHint}</span>
                      <span className="text-lg font-semibold tabular-nums text-[var(--ds-text)]">
                        {formatEuroCents(totalCents)}
                      </span>
                    </span>
                  )}
                />
                <DashboardSection.Body>
                  {form.costs.map((row, index) => (
                    <div key={row.id} className="flex items-end gap-3">
                      <div className="min-w-0 flex-1">
                        {index === 0 && <FormLabel htmlFor={`cost-label-${row.id}`}>{sm.costLabel}</FormLabel>}
                        <input
                          id={`cost-label-${row.id}`}
                          type="text"
                          aria-label={`${sm.costLabel} ${index + 1}`}
                          className={formInputClass}
                          value={row.label}
                          maxLength={SPONSORING_LIMITS.costLabelMaxLength}
                          onChange={(event) =>
                            change({
                              costs: form.costs.map((cost) =>
                                cost.id === row.id ? { ...cost, label: event.target.value } : cost,
                              ),
                            })
                          }
                        />
                        <FieldProblem shown={problems.has(`costs.${index}.label`)} text={sm.labelInvalid} />
                      </div>
                      <div className="w-32 shrink-0">
                        {index === 0 && <FormLabel htmlFor={`cost-amount-${row.id}`}>{sm.costAmount}</FormLabel>}
                        <input
                          id={`cost-amount-${row.id}`}
                          type="text"
                          inputMode="decimal"
                          aria-label={`${sm.costAmount} ${index + 1}`}
                          className={formInputClass}
                          value={row.amount}
                          onChange={(event) =>
                            change({
                              costs: form.costs.map((cost) =>
                                cost.id === row.id ? { ...cost, amount: event.target.value } : cost,
                              ),
                            })
                          }
                        />
                        <FieldProblem shown={problems.has(`costs.${index}.amount`)} text={sm.amountInvalid} />
                      </div>
                      <DashboardActionButton
                        action={DashboardActionId.Remove}
                        label={messages.common.delete}
                        iconOnly
                        type="button"
                        onClick={() => change({ costs: form.costs.filter((cost) => cost.id !== row.id) })}
                      />
                    </div>
                  ))}

                  <div>
                    {/* Off at the backend's limit, which bounds every request body. */}
                    <DashboardActionButton
                      action={DashboardActionId.Create}
                      label={sm.costAdd}
                      type="button"
                      disabled={atMax}
                      onClick={() => change({ costs: [...form.costs, { id: newCostRowId(), label: "", amount: "" }] })}
                    />
                  </div>

                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ds-text-subtle)]">
                    {sm.variableLabel}
                    <CopyableCode value="{annualCost}" copyLabel={messages.common.copy} />
                    <CopyableCode value="{monthlyCost}" copyLabel={messages.common.copy} />
                  </p>
                </DashboardSection.Body>
              </DashboardSection>

              {/* Its own card, because it answers a different question from the
                  items above it: not what the year costs, but what it takes to be
                  named for one. */}
              <DashboardSection className="overflow-hidden">
                <DashboardSection.Header
                  icon={<MedalIcon weight="duotone" className="size-4" />}
                  title={sm.sponsorMinimumTitle}
                />
                <DashboardSection.Body>
                  <div className="w-32">
                    <FormLabel htmlFor="sponsor-minimum">{sm.sponsorMinimumLabel}</FormLabel>
                    <input
                      id="sponsor-minimum"
                      aria-label={sm.sponsorMinimumLabel}
                      type="text"
                      inputMode="decimal"
                      className={formInputClass}
                      value={form.sponsorMinimum}
                      aria-invalid={problems.has("sponsorMinimum") || undefined}
                      onChange={(event) => change({ sponsorMinimum: event.target.value })}
                    />
                    <FieldProblem shown={problems.has("sponsorMinimum")} text={sm.amountInvalid} />
                  </div>
                  <p className="text-xs text-[var(--ds-text-muted)]">{sm.sponsorMinimumDescription}</p>
                </DashboardSection.Body>
              </DashboardSection>
            </div>

            <div className="grid min-w-0 gap-[var(--ds-space-base)] md:col-span-4">
              <DashboardSection className="overflow-hidden">
                <DashboardSection.Header
                  icon={<BankIcon weight="duotone" className="size-4" />}
                  title={sm.payeeTitle}
                  subtitle={sm.payeeDescription}
                />
                <DashboardSection.Body>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      id="payee-name"
                      label={sm.payeeNameLabel}
                      value={form.payeeName}
                      maxLength={SPONSORING_LIMITS.payeeNameMaxLength}
                      invalid={problems.has("payeeName")}
                      invalidText={sm.textInvalid}
                      hint={<VariableHint name="payeeName" />}
                      onChange={(payeeName) => change({ payeeName })}
                    />
                    <TextField
                      id="payee-iban"
                      label={sm.payeeIbanLabel}
                      value={form.payeeIban}
                      invalid={problems.has("payeeIban")}
                      invalidText={sm.ibanInvalid}
                      hint={<VariableHint name="payeeIban" />}
                      onChange={(payeeIban) => change({ payeeIban })}
                    />
                    <TextField
                      id="payee-bic"
                      label={sm.payeeBicLabel}
                      value={form.payeeBic}
                      invalid={problems.has("payeeBic")}
                      invalidText={sm.bicInvalid}
                      hint={<VariableHint name="payeeBic" before={sm.payeeBicHint} />}
                      onChange={(payeeBic) => change({ payeeBic })}
                    />
                  </div>
                </DashboardSection.Body>
              </DashboardSection>

              {/* Its own card, because it answers a different question from the
                  account above it: not where the money goes, but what is written
                  on it so this project can recognize it again. */}
              <DashboardSection className="overflow-hidden">
                <DashboardSection.Header
                  icon={<NoteIcon weight="duotone" className="size-4" />}
                  title={sm.purposesTitle}
                  subtitle={sm.purposesDescription}
                />
                <DashboardSection.Body>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      id="purpose-donation"
                      label={sm.purposeDonationLabel}
                      value={form.purposeDonation}
                      maxLength={SPONSORING_LIMITS.purposeMaxLength}
                      invalid={problems.has("purposeDonation")}
                      invalidText={sm.textInvalid}
                      hint={<VariableHint name="purposeDonation" />}
                      onChange={(purposeDonation) => change({ purposeDonation })}
                    />
                    <TextField
                      id="purpose-sponsor"
                      label={sm.purposeSponsorLabel}
                      value={form.purposeSponsor}
                      maxLength={SPONSORING_LIMITS.purposeMaxLength}
                      invalid={problems.has("purposeSponsor")}
                      invalidText={sm.textInvalid}
                      hint={<VariableHint name="purposeSponsor" />}
                      onChange={(purposeSponsor) => change({ purposeSponsor })}
                    />
                    <TextField
                      id="purpose-paypal"
                      label={sm.purposePaypalLabel}
                      value={form.purposePaypal}
                      maxLength={SPONSORING_LIMITS.purposeMaxLength}
                      invalid={problems.has("purposePaypal")}
                      invalidText={sm.textInvalid}
                      hint={<VariableHint name="purposePaypal" />}
                      onChange={(purposePaypal) => change({ purposePaypal })}
                    />
                  </div>
                </DashboardSection.Body>
              </DashboardSection>
            </div>
          </div>
        </fieldset>
      </PageBody>
    </PageLayout>
  );
}
