import { ENDPOINTS } from "@musiccloud/shared";
import { downloadJson } from "@/lib/download";
import type { EmailTemplate } from "@/shared/contracts/admin-email-templates";

export function exportEmailTemplateSingle(template: EmailTemplate) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = template;
  downloadJson(`${template.name}.json`, {
    version: 1,
    exportedAt: new Date().toISOString(),
    ...fields,
  });
}

export async function exportEmailTemplateAll() {
  const TOKEN_KEY = "admin_token";
  const stored = localStorage.getItem(TOKEN_KEY);
  const token = stored ? (JSON.parse(stored) as { token: string }).token : undefined;

  const res = await fetch(ENDPOINTS.admin.emailTemplates.export, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "email-templates.zip";
  a.click();
  URL.revokeObjectURL(url);
}
