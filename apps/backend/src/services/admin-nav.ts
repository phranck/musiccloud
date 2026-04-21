import {
  DEFAULT_LOCALE,
  isLocale,
  isSafeConfiguredUrl,
  type Locale,
  type NavId,
  type NavItem,
  type NavItemInput,
  type NavTarget,
} from "@musiccloud/shared";

import type { NavItemReplaceInput, NavItemRow } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

export type NavResult<T> = { ok: true; data: T } | { ok: false; code: "INVALID_INPUT"; message: string };

const VALID_NAV_IDS: NavId[] = ["header", "footer"];

function rowToNavItem(row: NavItemRow, translations?: Partial<Record<Locale, string>>): NavItem {
  const item: NavItem = {
    id: row.id,
    navId: row.navId,
    pageSlug: row.pageSlug,
    pageTitle: row.pageTitle,
    url: row.url,
    target: row.target,
    label: row.label,
    position: row.position,
    pageType: row.pageType,
    pageDisplayMode: row.pageDisplayMode,
    pageOverlayWidth: row.pageOverlayWidth,
  };
  if (translations && Object.keys(translations).length > 0) {
    item.translations = translations;
  }
  return item;
}

export function isValidNavId(value: string): value is NavId {
  return (VALID_NAV_IDS as string[]).includes(value);
}

export async function getManagedNavItems(navId: NavId): Promise<NavItem[]> {
  const repo = await getAdminRepository();
  const rows = await repo.listAdminNavItems(navId);
  return rows.map((r) => rowToNavItem(r));
}

export async function replaceManagedNavItems(navId: NavId, items: unknown): Promise<NavResult<NavItem[]>> {
  if (!Array.isArray(items)) {
    return { ok: false, code: "INVALID_INPUT", message: "items must be an array" };
  }

  type ValidatedNavItem = NavItemReplaceInput & { translations?: Partial<Record<Locale, string>> };
  const validated: ValidatedNavItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const raw = items[i];
    if (!raw || typeof raw !== "object") {
      return { ok: false, code: "INVALID_INPUT", message: `items[${i}] must be an object` };
    }
    const r = raw as Partial<NavItemInput>;

    const pageSlug =
      r.pageSlug == null ? null : typeof r.pageSlug === "string" && r.pageSlug.length > 0 ? r.pageSlug : null;
    const url = r.url == null ? null : typeof r.url === "string" && r.url.length > 0 ? r.url : null;

    if (!pageSlug && !url) {
      return { ok: false, code: "INVALID_INPUT", message: `items[${i}]: either pageSlug or url is required` };
    }

    if (url && !isSafeConfiguredUrl(url, { allowRelative: true, allowMailto: true })) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: `items[${i}]: url must be a safe https URL or relative path`,
      };
    }

    let target: NavTarget = "_self";
    if (r.target !== undefined) {
      if (r.target !== "_self" && r.target !== "_blank") {
        return { ok: false, code: "INVALID_INPUT", message: `items[${i}]: target must be _self or _blank` };
      }
      target = r.target;
    }

    let label: string | null = null;
    if (r.label != null) {
      if (typeof r.label !== "string" || r.label.length > 100) {
        return { ok: false, code: "INVALID_INPUT", message: `items[${i}]: label must be string (max 100 chars)` };
      }
      label = r.label.length > 0 ? r.label : null;
    }

    validated.push({ pageSlug, url, target, label, translations: r.translations });
  }

  const repo = await getAdminRepository();
  const rows = await repo.replaceAdminNavItems(navId, validated);

  for (let i = 0; i < rows.length; i++) {
    const persisted = rows[i]!;
    const input = validated[i]!;
    const translations = Object.entries(input.translations ?? {})
      .filter(
        ([locale, label]) =>
          isLocale(locale) && locale !== DEFAULT_LOCALE && typeof label === "string" && label.length > 0,
      )
      .map(([locale, label]) => ({
        locale,
        label: label as string,
        sourceUpdatedAt: persisted.labelUpdatedAt,
      }));
    await repo.replaceNavItemTranslations(persisted.id, translations);
  }

  const translationRows = await repo.listNavTranslations(navId);
  const translationsByItemId = new Map<number, Partial<Record<Locale, string>>>();
  for (const t of translationRows) {
    if (!isLocale(t.locale)) continue;
    let map = translationsByItemId.get(t.navItemId);
    if (!map) {
      map = {};
      translationsByItemId.set(t.navItemId, map);
    }
    map[t.locale] = t.label;
  }

  return {
    ok: true,
    data: rows.map((r) => rowToNavItem(r, translationsByItemId.get(r.id))),
  };
}

// -- Public read --------------------------------------------------------------

export async function getPublicNavItems(navId: NavId): Promise<NavItem[]> {
  const repo = await getAdminRepository();
  const rows = await repo.listAdminNavItems(navId);
  return rows.map((r) => rowToNavItem(r));
}
