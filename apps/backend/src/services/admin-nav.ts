import {
  ContentContext,
  DEFAULT_LOCALE,
  expectedNavigationPlacements,
  hasAllContextBits,
  isLocale,
  isNavigationSystemKey,
  isSafeConfiguredUrl,
  isValidContentContextMask,
  isValidNavigationAreaMask,
  type Locale,
  NAVIGATION_SYSTEM_TARGETS,
  type NavId,
  type NavItem,
  type NavItemInput,
  NavigationArea,
  type NavigationConfiguration,
  type NavigationEntry,
  type NavigationEntryInput,
  type NavigationPlacement,
  NavigationSystemKey,
  NavigationTargetKind,
  type NavTarget,
} from "@musiccloud/shared";

import type {
  NavItemReplaceInput,
  NavItemRow,
  NavigationConfigurationEntryRow,
  NavigationConfigurationReplaceInput,
} from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { normalizeEditorialPath } from "./editorial-path.js";

export type NavResult<T> = { ok: true; data: T } | { ok: false; code: "INVALID_INPUT"; message: string };

const VALID_NAV_IDS: NavId[] = ["header", "footer"];

type ValidatedLegacyNavItem = NavItemReplaceInput & { translations?: Partial<Record<Locale, string>> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(message: string): NavResult<T> {
  return { ok: false, code: "INVALID_INPUT", message };
}

function isProtectedDocsUrl(url: string): boolean {
  if (!url.startsWith("/")) return false;
  try {
    const path = new URL(url, "https://navigation.invalid").pathname;
    const normalized = normalizeEditorialPath(path);
    return normalized === "/docs" || normalized.startsWith("/docs/");
  } catch {
    return true;
  }
}

function pageClaimsProtectedDocsNamespace(page: { publications?: Array<{ path: string }> }): boolean {
  return page.publications?.some((publication) => isProtectedDocsUrl(publication.path)) ?? false;
}

function rowToNavigationEntry(row: NavigationConfigurationEntryRow): NavigationEntry {
  const systemTarget = row.systemKey ? NAVIGATION_SYSTEM_TARGETS[row.systemKey] : null;
  return {
    id: row.id,
    targetKind: row.targetKind,
    pageId: row.pageId,
    pageSlug: row.pageSlug ?? null,
    pageTitle: row.pageTitle ?? null,
    url: row.url,
    systemKey: row.systemKey,
    target: systemTarget?.target ?? row.target,
    label: row.label,
    contextMask: row.contextMask,
    areaMask: row.areaMask,
    placements: row.placements,
    translations: row.translations,
    canonicalRoute: systemTarget?.canonicalRoute ?? null,
    behavior: systemTarget?.behavior ?? null,
  };
}

function navigationMasks(placements: NavigationPlacement[]): {
  contextMask: NavigationConfigurationReplaceInput["contextMask"];
  areaMask: NavigationConfigurationReplaceInput["areaMask"];
} {
  let contextMask = 0;
  let areaMask = 0;
  for (const placement of placements) {
    contextMask |= placement.context;
    areaMask |= placement.area;
  }
  return {
    contextMask: contextMask as NavigationConfigurationReplaceInput["contextMask"],
    areaMask: areaMask as NavigationConfigurationReplaceInput["areaMask"],
  };
}

function normalizedLegacyTranslations(
  translations: Partial<Record<Locale, string>> | undefined,
): Partial<Record<Locale, string>> {
  return Object.fromEntries(
    Object.entries(translations ?? {}).filter(
      ([locale, label]) =>
        isLocale(locale) && locale !== DEFAULT_LOCALE && typeof label === "string" && label.length > 0,
    ),
  ) as Partial<Record<Locale, string>>;
}

function toConfigurationInput(
  row: NavigationConfigurationEntryRow,
  placements: NavigationPlacement[],
): NavigationConfigurationReplaceInput {
  const { contextMask, areaMask } = navigationMasks(placements);
  return {
    targetKind: row.targetKind,
    pageId: row.pageId,
    url: row.url,
    systemKey: row.systemKey,
    target: row.target,
    label: row.label,
    contextMask,
    areaMask,
    placements,
    translations: row.translations,
  };
}

function legacyTargetMatches(row: NavigationConfigurationEntryRow, input: ValidatedLegacyNavItem): boolean {
  return input.pageSlug
    ? row.targetKind === NavigationTargetKind.Page && row.pageSlug === input.pageSlug
    : row.targetKind === NavigationTargetKind.Url && row.url === input.url;
}

async function replaceContextualLegacySlice(
  repo: Awaited<ReturnType<typeof getAdminRepository>>,
  navId: NavId,
  items: ValidatedLegacyNavItem[],
): Promise<NavResult<NavItem[]> | null> {
  const existing = await repo.listNavigationConfiguration();
  if (!existing.some((entry) => entry.placements.length > 0)) return null;

  const area = navId === "header" ? NavigationArea.Main : NavigationArea.Footer;
  const isManagedPlacement = (placement: NavigationPlacement) =>
    placement.context === ContentContext.Frontend && placement.area === area;
  const sliceEntries = existing.filter((entry) => entry.placements.some(isManagedPlacement));
  const consumed = new Set<number>();
  const nextEntries: NavigationConfigurationReplaceInput[] = [];
  const preservedIndexById = new Map<number, number>();

  for (const entry of existing) {
    const placements = entry.placements.filter((placement) => !isManagedPlacement(placement));
    if (placements.length === 0) continue;
    preservedIndexById.set(entry.id, nextEntries.length);
    nextEntries.push(toConfigurationInput(entry, placements));
  }

  for (let position = 0; position < items.length; position++) {
    const item = items[position]!;
    const matched = sliceEntries.find((entry) => !consumed.has(entry.id) && legacyTargetMatches(entry, item));
    if (matched) consumed.add(matched.id);

    let pageId: string | null = null;
    if (item.pageSlug) {
      const page = await repo.getContentPageBySlug(item.pageSlug);
      if (!page?.id || !page.contextMask || !hasAllContextBits(page.contextMask, ContentContext.Frontend)) {
        return invalid(`navigation page '${item.pageSlug}' is not available in the Frontend context`);
      }
      if (pageClaimsProtectedDocsNamespace(page)) {
        return invalid(`navigation page '${item.pageSlug}' is inside the protected docs namespace`);
      }
      if (matched?.pageId && matched.pageId !== page.id) {
        return invalid(`navigation page '${item.pageSlug}' no longer matches its stable page identity`);
      }
      pageId = page.id;
    }

    const placement: NavigationPlacement = {
      context: ContentContext.Frontend,
      area,
      position,
    };
    const preservedIndex = matched ? preservedIndexById.get(matched.id) : undefined;
    if (preservedIndex !== undefined) {
      const preserved = nextEntries[preservedIndex]!;
      const placements = [...preserved.placements, placement];
      const masks = navigationMasks(placements);
      nextEntries[preservedIndex] = {
        ...preserved,
        ...masks,
        placements,
        target: item.target ?? "_self",
        label: item.label ?? null,
        translations: normalizedLegacyTranslations(item.translations),
      };
      continue;
    }

    nextEntries.push({
      targetKind: item.pageSlug ? NavigationTargetKind.Page : NavigationTargetKind.Url,
      pageId,
      url: item.url ?? null,
      systemKey: null,
      target: item.target ?? "_self",
      label: item.label ?? null,
      contextMask: ContentContext.Frontend,
      areaMask: area,
      placements: [placement],
      translations: normalizedLegacyTranslations(item.translations),
    });
  }

  await repo.replaceNavigationConfiguration(nextEntries);
  const rows = await repo.listAdminNavItems(navId);
  const translationRows = await repo.listNavTranslations(navId);
  const translationsByItemId = new Map<number, Partial<Record<Locale, string>>>();
  for (const translation of translationRows) {
    if (!isLocale(translation.locale)) continue;
    const translations = translationsByItemId.get(translation.navItemId) ?? {};
    translations[translation.locale] = translation.label;
    translationsByItemId.set(translation.navItemId, translations);
  }
  return {
    ok: true,
    data: rows.map((row) => rowToNavItem(row, translationsByItemId.get(row.id))),
  };
}

function parseTranslations(value: unknown, entryIndex: number): Partial<Record<Locale, string>> | NavResult<never> {
  if (value === undefined) return {};
  if (!isPlainObject(value)) return invalid(`entries[${entryIndex}].translations must be an object`);
  const translations: Partial<Record<Locale, string>> = {};
  for (const [locale, label] of Object.entries(value)) {
    if (!isLocale(locale) || typeof label !== "string" || label.length === 0 || label.length > 100) {
      return invalid(`entries[${entryIndex}].translations contains an invalid label`);
    }
    if (locale === DEFAULT_LOCALE) continue;
    translations[locale] = label;
  }
  return translations;
}

function parsePlacements(
  value: unknown,
  contextMask: number,
  areaMask: number,
  entryIndex: number,
): NavigationPlacement[] | NavResult<never> {
  if (!Array.isArray(value)) return invalid(`entries[${entryIndex}].placements must be an array`);

  const expected = expectedNavigationPlacements(contextMask, areaMask);
  const expectedKeys = new Set(expected.map(({ context, area }) => `${context}:${area}`));
  const actualKeys = new Set<string>();
  const placements: NavigationPlacement[] = [];
  for (const raw of value) {
    if (!isPlainObject(raw)) return invalid(`entries[${entryIndex}].placements contains a non-object`);
    const { context, area, position } = raw;
    if (
      (context !== ContentContext.Frontend && context !== ContentContext.DeveloperPortal) ||
      (area !== NavigationArea.Main && area !== NavigationArea.Footer) ||
      !Number.isInteger(position) ||
      (position as number) < 0
    ) {
      return invalid(`entries[${entryIndex}].placements contains an invalid placement`);
    }
    const key = `${context}:${area}`;
    if (actualKeys.has(key)) return invalid(`entries[${entryIndex}].placements contains a duplicate placement`);
    actualKeys.add(key);
    placements.push({
      context: context as NavigationPlacement["context"],
      area: area as NavigationPlacement["area"],
      position: position as number,
    });
  }
  if (actualKeys.size !== expectedKeys.size || [...expectedKeys].some((key) => !actualKeys.has(key))) {
    return invalid(`entries[${entryIndex}].placements must equal the active context and area product`);
  }
  return placements;
}

async function validateNavigationEntry(
  raw: unknown,
  entryIndex: number,
): Promise<NavigationConfigurationReplaceInput | NavResult<never>> {
  if (!isPlainObject(raw)) return invalid(`entries[${entryIndex}] must be an object`);

  const contextMask = raw.contextMask;
  const areaMask = raw.areaMask;
  if (typeof contextMask !== "number" || !isValidContentContextMask(contextMask)) {
    return invalid(`entries[${entryIndex}].contextMask is invalid`);
  }
  if (typeof areaMask !== "number" || !isValidNavigationAreaMask(areaMask)) {
    return invalid(`entries[${entryIndex}].areaMask is invalid`);
  }
  if (
    raw.targetKind !== NavigationTargetKind.Page &&
    raw.targetKind !== NavigationTargetKind.Url &&
    raw.targetKind !== NavigationTargetKind.System
  ) {
    return invalid(`entries[${entryIndex}].targetKind is invalid`);
  }
  if (raw.target !== "_self" && raw.target !== "_blank") {
    return invalid(`entries[${entryIndex}].target is invalid`);
  }
  if (raw.label !== null && (typeof raw.label !== "string" || raw.label.length > 100)) {
    return invalid(`entries[${entryIndex}].label is invalid`);
  }

  const placements = parsePlacements(raw.placements, contextMask, areaMask, entryIndex);
  if (!Array.isArray(placements)) return placements;
  const translations = parseTranslations(raw.translations, entryIndex);
  if ("ok" in translations) return translations;

  let pageId: string | null = null;
  let url: string | null = null;
  let systemKey: NavigationEntryInput["systemKey"] = null;
  if (raw.targetKind === NavigationTargetKind.Page) {
    if (typeof raw.pageId !== "string" || raw.pageId.length === 0 || raw.url !== null || raw.systemKey !== null) {
      return invalid(`entries[${entryIndex}] has invalid page target fields`);
    }
    const repo = await getAdminRepository();
    const page = await repo.getContentPageById(raw.pageId);
    if (!page || !page.contextMask || !hasAllContextBits(page.contextMask, contextMask)) {
      return invalid(`entries[${entryIndex}] targets a page without all required contexts`);
    }
    if (pageClaimsProtectedDocsNamespace(page)) {
      return invalid(`entries[${entryIndex}] targets a Page inside the protected docs namespace`);
    }
    pageId = raw.pageId;
  } else if (raw.targetKind === NavigationTargetKind.Url) {
    if (
      raw.pageId !== null ||
      typeof raw.url !== "string" ||
      raw.url.length === 0 ||
      raw.systemKey !== null ||
      !isSafeConfiguredUrl(raw.url, { allowRelative: true, allowMailto: true }) ||
      isProtectedDocsUrl(raw.url)
    ) {
      return invalid(`entries[${entryIndex}] has invalid URL target fields`);
    }
    url = raw.url;
  } else {
    if (
      raw.pageId !== null ||
      raw.url !== null ||
      !isNavigationSystemKey(raw.systemKey) ||
      raw.target !== "_self" ||
      contextMask !== ContentContext.DeveloperPortal
    ) {
      return invalid(`entries[${entryIndex}] has invalid protected system target fields`);
    }
    systemKey = raw.systemKey;
  }

  return {
    targetKind: raw.targetKind,
    pageId,
    url,
    systemKey,
    target: raw.target,
    label: raw.label,
    contextMask,
    areaMask,
    placements,
    translations,
  };
}

export async function getManagedNavigationConfiguration(): Promise<NavigationConfiguration> {
  const repo = await getAdminRepository();
  const entries = await repo.listNavigationConfiguration();
  return { entries: entries.map(rowToNavigationEntry) };
}

export async function replaceManagedNavigationConfiguration(
  input: unknown,
): Promise<NavResult<NavigationConfiguration>> {
  if (!isPlainObject(input) || !Array.isArray(input.entries)) {
    return invalid("body must be { entries: [...] }");
  }

  const entries: NavigationConfigurationReplaceInput[] = [];
  const positions = new Set<string>();
  const systemKeys = new Set<string>();
  for (let index = 0; index < input.entries.length; index++) {
    const entry = await validateNavigationEntry(input.entries[index], index);
    if ("ok" in entry) return entry;
    if (entry.systemKey) {
      if (systemKeys.has(entry.systemKey)) return invalid(`duplicate system key: ${entry.systemKey}`);
      systemKeys.add(entry.systemKey);
    }
    for (const placement of entry.placements) {
      const key = `${placement.context}:${placement.area}:${placement.position}`;
      if (positions.has(key)) return invalid(`duplicate position in navigation list: ${key}`);
      positions.add(key);
    }
    entries.push(entry);
  }
  for (const systemKey of [NavigationSystemKey.Docs, NavigationSystemKey.ApiReference, NavigationSystemKey.Search]) {
    if (!systemKeys.has(systemKey)) return invalid(`missing protected system key: ${systemKey}`);
  }

  const repo = await getAdminRepository();
  const persisted = await repo.replaceNavigationConfiguration(entries);
  return { ok: true, data: { entries: persisted.map(rowToNavigationEntry) } };
}

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
  return rows.map((r) => rowToNavItem(r, translationsByItemId.get(r.id)));
}

export async function replaceManagedNavItems(navId: NavId, items: unknown): Promise<NavResult<NavItem[]>> {
  if (!Array.isArray(items)) {
    return { ok: false, code: "INVALID_INPUT", message: "items must be an array" };
  }

  const validated: ValidatedLegacyNavItem[] = [];
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

    if (url && (!isSafeConfiguredUrl(url, { allowRelative: true, allowMailto: true }) || isProtectedDocsUrl(url))) {
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
  if (typeof repo.listNavigationConfiguration === "function") {
    const contextualResult = await replaceContextualLegacySlice(repo, navId, validated);
    if (contextualResult) return contextualResult;
  }
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

export async function getPublicNavItems(navId: NavId, locale: Locale): Promise<NavItem[]> {
  const repo = await getAdminRepository();
  const rows = await repo.listAdminNavItems(navId);

  if (locale === DEFAULT_LOCALE) {
    return rows.map((r) => rowToNavItem(r));
  }

  // Load nav-item translations once for the whole nav.
  const navTxRows = await repo.listNavTranslations(navId);
  const navTxByItemId = new Map<number, string>();
  for (const t of navTxRows) {
    if (t.locale === locale) {
      navTxByItemId.set(t.navItemId, t.label);
    }
  }

  // Load page translations for all linked pages (one query per page slug; nav is small).
  const pageSlugs = Array.from(new Set(rows.map((r) => r.pageSlug).filter((s): s is string => s !== null)));
  const pageTxBySlug = new Map<string, string>();
  for (const pageSlug of pageSlugs) {
    const txRows = await repo.listPageTranslations(pageSlug);
    const tx = txRows.find((t) => t.locale === locale);
    if (tx) pageTxBySlug.set(pageSlug, tx.title);
  }

  return rows.map((r) => {
    const item = rowToNavItem(r);

    // Resolve the translated page title.
    const resolvedPageTitle = r.pageSlug ? (pageTxBySlug.get(r.pageSlug) ?? r.pageTitle) : r.pageTitle;

    // Resolve label via 4-step priority chain:
    // 1. nav_item_translations label for the requested locale
    // 2. Nav row's default-locale label (when non-null)
    // 3. Linked page's translated title
    // 4. Linked page's default-locale title
    const navTxLabel = navTxByItemId.get(r.id);
    const resolvedLabel = navTxLabel ?? r.label ?? resolvedPageTitle ?? null;

    item.label = resolvedLabel;
    item.pageTitle = resolvedPageTitle;
    return item;
  });
}
