import type { EmailBlock } from "@musiccloud/shared";
import type {
  EmailActionBindingDto,
  EmailAssetDto,
  EmailBrandingDto,
  EmailTemplateBrandingOverrides,
  EmailTemplateRow,
  EmailTemplateVariable,
  EmailTemplateWriteData,
} from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  requiredVariables: EmailTemplateVariable[];
  isSystemTemplate: boolean;
  createdAt: string;
  updatedAt: string;
  /** Per-template branding overrides; each `null` field inherits the global default. */
  branding: EmailTemplateBrandingOverrides;
}

function rowToEmailTemplate(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    blocks: row.blocks,
    requiredVariables: row.requiredVariables,
    isSystemTemplate: row.isSystemTemplate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    branding: row.branding,
  };
}

export async function getManagedEmailTemplates(): Promise<EmailTemplate[]> {
  const repo = await getAdminRepository();
  const rows = await repo.listEmailTemplates();
  return rows.map(rowToEmailTemplate);
}

export async function getManagedEmailTemplateById(
  id: number,
): Promise<{ ok: true; data: EmailTemplate } | { ok: false }> {
  const repo = await getAdminRepository();
  const row = await repo.getEmailTemplateById(id);
  if (!row) return { ok: false };
  return { ok: true, data: rowToEmailTemplate(row) };
}

export async function createManagedEmailTemplate(
  data: Omit<EmailTemplateWriteData, "isSystemTemplate">,
): Promise<{ ok: true; data: EmailTemplate } | { ok: false; reason: "name_taken" }> {
  const repo = await getAdminRepository();
  const existing = await repo.getEmailTemplateByName(data.name);
  if (existing) return { ok: false, reason: "name_taken" };
  const row = await repo.insertEmailTemplate(data);
  return { ok: true, data: rowToEmailTemplate(row) };
}

export async function updateManagedEmailTemplate(
  id: number,
  data: Partial<Omit<EmailTemplateWriteData, "isSystemTemplate">>,
): Promise<{ ok: true; data: EmailTemplate } | { ok: false; reason: "not_found" }> {
  const repo = await getAdminRepository();
  const row = await repo.updateEmailTemplate(id, data);
  if (!row) return { ok: false, reason: "not_found" };
  return { ok: true, data: rowToEmailTemplate(row) };
}

export async function importManagedEmailTemplate(
  data: Omit<EmailTemplateWriteData, "isSystemTemplate"> & { isSystemTemplate?: boolean },
  overwrite: boolean,
): Promise<{ ok: true; data: EmailTemplate } | { ok: false; reason: "name_taken" }> {
  const repo = await getAdminRepository();
  const existing = await repo.getEmailTemplateByName(data.name);
  if (existing) {
    if (!overwrite) return { ok: false, reason: "name_taken" };
    const row = await repo.updateEmailTemplate(existing.id, data);
    if (!row) throw new Error(`Failed to update email template "${data.name}"`);
    return { ok: true, data: rowToEmailTemplate(row) };
  }
  const row = await repo.insertEmailTemplate(data);
  return { ok: true, data: rowToEmailTemplate(row) };
}

export async function deleteManagedEmailTemplate(
  id: number,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const repo = await getAdminRepository();
  const deleted = await repo.deleteEmailTemplate(id);
  return deleted ? { ok: true } : { ok: false, reason: "not_found" };
}

/**
 * Reads the global email branding singleton (header/footer asset + footer text).
 *
 * @returns The branding row.
 */
export async function getManagedEmailBranding(): Promise<EmailBrandingDto> {
  const repo = await getAdminRepository();
  return repo.getEmailBranding();
}

/**
 * Partially updates the global email branding singleton.
 *
 * @param data - Subset of mutable branding fields.
 * @returns The updated branding row.
 */
export async function updateManagedEmailBranding(data: Partial<EmailBrandingDto>): Promise<EmailBrandingDto> {
  const repo = await getAdminRepository();
  return repo.updateEmailBranding(data);
}

/**
 * Lists every email image asset's metadata (newest first), for the dashboard's
 * shared-asset picker so a previously uploaded image can be reused.
 *
 * @returns All email asset metadata rows, newest first.
 */
export async function listManagedEmailAssets(): Promise<EmailAssetDto[]> {
  const repo = await getAdminRepository();
  return repo.listEmailAssets();
}

/**
 * Persists a new email image asset.
 *
 * @param data - The asset's MIME type and raw bytes.
 * @returns The persisted asset's metadata (bytes are not returned).
 */
export async function createManagedEmailAsset(data: { mimeType: string; bytes: Buffer }): Promise<EmailAssetDto> {
  const repo = await getAdminRepository();
  return repo.insertEmailAsset(data);
}

/**
 * Reads an email asset's raw bytes for streaming.
 *
 * @param id - The asset's id.
 * @returns The MIME type and bytes, or `null` when no row matches.
 */
export async function getManagedEmailAssetBytes(id: string): Promise<{ mimeType: string; bytes: Buffer } | null> {
  const repo = await getAdminRepository();
  return repo.getEmailAssetBytes(id);
}

/**
 * Lists action↔template bindings, optionally restricted to one action key.
 *
 * @param actionKey - When given, restricts results to this action.
 * @returns The matching bindings.
 */
export async function listManagedEmailActionBindings(actionKey?: string): Promise<EmailActionBindingDto[]> {
  const repo = await getAdminRepository();
  return repo.listEmailActionBindings(actionKey);
}

/**
 * Creates (or re-enables) a binding of an action key to a template.
 *
 * @param data - The action key and template id to bind.
 * @returns The persisted binding.
 */
export async function createManagedEmailActionBinding(data: {
  actionKey: string;
  templateId: number;
}): Promise<EmailActionBindingDto> {
  const repo = await getAdminRepository();
  return repo.createEmailActionBinding(data);
}

/**
 * Enables or disables an existing action binding.
 *
 * @param id - The binding's id.
 * @param enabled - The new enabled state.
 * @returns The updated binding, or `null` when no row matches.
 */
export async function setManagedEmailActionBindingEnabled(
  id: string,
  enabled: boolean,
): Promise<EmailActionBindingDto | null> {
  const repo = await getAdminRepository();
  return repo.setEmailActionBindingEnabled(id, enabled);
}

/**
 * Deletes an action binding.
 *
 * @param id - The binding's id.
 * @returns Whether the requested row exists or mutation succeeded.
 */
export async function deleteManagedEmailActionBinding(id: string): Promise<boolean> {
  const repo = await getAdminRepository();
  return repo.deleteEmailActionBinding(id);
}
