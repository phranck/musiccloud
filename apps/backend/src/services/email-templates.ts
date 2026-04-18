import type { EmailTemplateRow, EmailTemplateWriteData } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  headerBannerUrl: string | null;
  headerText: string | null;
  bodyText: string;
  footerBannerUrl: string | null;
  footerText: string | null;
  isSystemTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToEmailTemplate(row: EmailTemplateRow): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    headerBannerUrl: row.headerBannerUrl,
    headerText: row.headerText,
    bodyText: row.bodyText,
    footerBannerUrl: row.footerBannerUrl,
    footerText: row.footerText,
    isSystemTemplate: row.isSystemTemplate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
