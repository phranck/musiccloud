import { DashboardActionButton, DashboardActionId } from "@musiccloud/dashboard-ui";
import { deriveSupportAmounts, formatEuroCents, SPONSORING_LIMITS } from "@musiccloud/shared";
import { BankIcon, ChatTextIcon, ReceiptIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import { useAuth } from "@/features/auth/AuthContext";
import { fetchSponsoringConfig, SPONSORING_CONFIG_QUERY_KEY, updateSponsoringConfig } from "@/features/sponsoring/api";
import {
  newCostRowId,
  type SponsoringForm,
  sponsoringFormProblems,
  toSponsoringConfig,
  toSponsoringForm,
} from "@/features/sponsoring/sponsoringForm";
import { AdminRole } from "@/shared/constants/domain";
import { FormLabel, formInputClass } from "@/shared/ui/FormPrimitives";

const messages = dashboardCopy;
const sm = messages.sponsoring;

/** Props of {@link FieldHint}. */
interface FieldHintProps {
  /** Whether the field it belongs to would be refused. */
  shown: boolean;
  /** What is wrong with it. */
  text: string;
}

/**
 * The line under a field that the backend would refuse, in the style the plan
 * editor uses for the same purpose.
 *
 * @param props - See {@link FieldHintProps}.
 * @returns The hint, or nothing while the field is fine.
 */
function FieldHint({ shown, text }: FieldHintProps) {
  return shown ? <p className="mt-1 text-xs text-amber-400">{text}</p> : null;
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
  /** The longest value the backend accepts. */
  maxLength?: number;
  /** Whether the backend would refuse the value. */
  invalid: boolean;
  /** What is wrong when it is refused. */
  invalidText: string;
}

/**
 * One labelled text input with its refusal hint.
 *
 * @param props - See {@link TextFieldProps}.
 * @returns The field.
 */
function TextField({ id, label, value, onChange, maxLength, invalid, invalidText }: TextFieldProps) {
  return (
    <div>
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
      <FieldHint shown={invalid} text={invalidText} />
    </div>
  );
}

/**
 * The editor of the sponsoring setting: running costs, payee and transfer
 * purposes.
 *
 * Three cards with one save, because the support page reads all three at once
 * and a half-saved setting would print one account beside another's purposes.
 * Every admin can read it, and only the owner can change it, because the payee
 * decides where money goes; for anybody else the fields are disabled and the
 * page says why. Save stays off while any field would be refused, and the
 * server's own message appears if it refuses anyway.
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
  const costsUsable = ![...problems].some((field) => field.startsWith("costs"));
  const amounts = costsUsable ? deriveSupportAmounts(toSponsoringConfig(form)) : null;
  const atMax = form.costs.length >= SPONSORING_LIMITS.maxCostItems;
  const savable = isOwner && draft !== null && problems.size === 0 && !saveMutation.isPending;

  function change(patch: Partial<SponsoringForm>) {
    setDraft({ ...form, ...patch });
    setSaved(false);
  }

  return (
    <PageLayout>
      <PageHeader title={sm.settingsTitle} />

      <fieldset disabled={!isOwner} className="grid w-full min-w-0 gap-[var(--ds-space-base)]">
        {!isOwner && <p className="text-sm text-[var(--ds-text-muted)]">{sm.ownerOnly}</p>}

        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header icon={<ReceiptIcon weight="duotone" className="size-4" />} title={sm.costsTitle} />
          <DashboardSection.Body>
            <p className="text-sm text-[var(--ds-text-muted)]">{sm.costsDescription}</p>
            {form.costs.length > 0 && (
              <ul className="grid gap-2">
                {form.costs.map((row, index) => (
                  <li key={row.id} className="grid grid-cols-[1fr_10rem_auto] items-start gap-2">
                    <div>
                      <input
                        type="text"
                        aria-label={`${sm.costLabel} ${index + 1}`}
                        className={formInputClass}
                        value={row.label}
                        maxLength={SPONSORING_LIMITS.costLabelMaxLength}
                        placeholder={sm.costLabelPlaceholder}
                        onChange={(event) =>
                          change({
                            costs: form.costs.map((cost) =>
                              cost.id === row.id ? { ...cost, label: event.target.value } : cost,
                            ),
                          })
                        }
                      />
                      <FieldHint shown={problems.has(`costs.${index}.label`)} text={sm.labelInvalid} />
                    </div>
                    <div>
                      <input
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
                      <FieldHint shown={problems.has(`costs.${index}.amount`)} text={sm.amountInvalid} />
                    </div>
                    <DashboardActionButton
                      action={DashboardActionId.Remove}
                      label={sm.costRemove}
                      iconOnly
                      type="button"
                      onClick={() => change({ costs: form.costs.filter((cost) => cost.id !== row.id) })}
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-3">
              <DashboardActionButton
                action={DashboardActionId.Create}
                label={sm.costAdd}
                type="button"
                disabled={atMax}
                onClick={() => change({ costs: [...form.costs, { id: newCostRowId(), label: "", amount: "" }] })}
              />
              {atMax && (
                <p className="text-xs text-amber-400">
                  {sm.costsMaxReached.replace("{max}", String(SPONSORING_LIMITS.maxCostItems))}
                </p>
              )}
            </div>
            {amounts && (
              <p className="text-sm text-[var(--ds-text-muted)]">
                {sm.costsSummary
                  .replace("{annual}", formatEuroCents(amounts.annualCostCents))
                  .replace("{monthly}", formatEuroCents(amounts.monthlyCostCents))
                  .replace("{week}", String(amounts.weekEur))
                  .replace("{month}", String(amounts.monthEur))
                  .replace("{quarter}", String(amounts.quarterEur))
                  .replace("{year}", String(amounts.yearEur))}
              </p>
            )}
            <div className="max-w-xs">
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
              <FieldHint shown={problems.has("sponsorMinimum")} text={sm.amountInvalid} />
              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{sm.sponsorMinimumDescription}</p>
            </div>
          </DashboardSection.Body>
        </DashboardSection>

        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header icon={<BankIcon weight="duotone" className="size-4" />} title={sm.payeeTitle} />
          <DashboardSection.Body>
            <p className="text-sm text-[var(--ds-text-muted)]">{sm.payeeDescription}</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <TextField
                id="payee-name"
                label={sm.payeeNameLabel}
                value={form.payeeName}
                maxLength={SPONSORING_LIMITS.payeeNameMaxLength}
                invalid={problems.has("payeeName")}
                invalidText={sm.textInvalid}
                onChange={(payeeName) => change({ payeeName })}
              />
              <TextField
                id="payee-iban"
                label={sm.payeeIbanLabel}
                value={form.payeeIban}
                invalid={problems.has("payeeIban")}
                invalidText={sm.ibanInvalid}
                onChange={(payeeIban) => change({ payeeIban })}
              />
              <TextField
                id="payee-bic"
                label={sm.payeeBicLabel}
                value={form.payeeBic}
                invalid={problems.has("payeeBic")}
                invalidText={sm.bicInvalid}
                onChange={(payeeBic) => change({ payeeBic })}
              />
            </div>
          </DashboardSection.Body>
        </DashboardSection>

        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header
            icon={<ChatTextIcon weight="duotone" className="size-4" />}
            title={sm.purposesTitle}
          />
          <DashboardSection.Body>
            <p className="text-sm text-[var(--ds-text-muted)]">{sm.purposesDescription}</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <TextField
                id="purpose-donation"
                label={sm.purposeDonationLabel}
                value={form.purposeDonation}
                maxLength={SPONSORING_LIMITS.purposeMaxLength}
                invalid={problems.has("purposeDonation")}
                invalidText={sm.textInvalid}
                onChange={(purposeDonation) => change({ purposeDonation })}
              />
              <TextField
                id="purpose-sponsor"
                label={sm.purposeSponsorLabel}
                value={form.purposeSponsor}
                maxLength={SPONSORING_LIMITS.purposeMaxLength}
                invalid={problems.has("purposeSponsor")}
                invalidText={sm.textInvalid}
                onChange={(purposeSponsor) => change({ purposeSponsor })}
              />
              <TextField
                id="purpose-paypal"
                label={sm.purposePaypalLabel}
                value={form.purposePaypal}
                maxLength={SPONSORING_LIMITS.purposeMaxLength}
                invalid={problems.has("purposePaypal")}
                invalidText={sm.textInvalid}
                onChange={(purposePaypal) => change({ purposePaypal })}
              />
            </div>
          </DashboardSection.Body>
          <DashboardSection.Footer>
            <DashboardActionButton
              action={DashboardActionId.Save}
              label={saved ? messages.common.saved : messages.common.save}
              disabled={!savable}
              type="button"
              onClick={() => saveMutation.mutate(toSponsoringConfig(form))}
            />
            {saveMutation.isError && <SaveErrorMessage error={saveMutation.error} className="mr-auto" />}
          </DashboardSection.Footer>
        </DashboardSection>
      </fieldset>
    </PageLayout>
  );
}
