/**
 * @file The editor for the places somebody can be found.
 *
 * Ported from lmaa.space (`packages/ui/src/SocialMediaEditor.tsx`). The
 * behavior and the markup are lmaa's; the shared package and the names of a
 * few short-lived variables are musiccloud's.
 */

import {
  detectProfilePlatform,
  isFediverseHandle,
  normalizeSocialMediaValue,
  type SocialMediaLinks,
  type SocialPlatformKey,
  WEBSITE_PLATFORM,
} from "@musiccloud/shared";
import { ArrowSquareOutIcon, GlobeIcon, MinusCircleIcon, PlusCircleIcon } from "@phosphor-icons/react";
import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PLATFORM_MAP, PLATFORMS } from "./platforms.js";

/** One row of the editor, which may still lack a platform or an address. */
interface Entry {
  /** A key for the row, unique for the page's lifetime. */
  id: string;
  /** Empty until a platform is chosen or recognised from the address. */
  platform: SocialPlatformKey | "";
  /** The address as typed. */
  url: string;
}

/**
 * Localizable UI copy contract for the social media editor.
 */
export interface SocialMediaEditorMessages {
  urlPlaceholder: string;
  addAriaLabel: string;
  removeAriaLabel: string;
  openAriaLabel: string;
  selectPlatformAriaLabel: string;
  invalidUrlMessage: (platformLabel: string) => string;
}

/**
 * Props for the social media key-value editor component.
 */
export interface SocialMediaEditorProps {
  value: SocialMediaLinks;
  onChange: (value: SocialMediaLinks) => void;
  messages: SocialMediaEditorMessages;
  blurOnPaste?: boolean;
  /**
   * A site's own mark against the address it belongs to, as inline data.
   *
   * The same marks the site itself will show, so what stands beside an address
   * here is what a reader will see. Absent for an address whose site has none,
   * and the globe stands for it.
   */
  favicons?: Record<string, string>;
}

/**
 * The message for a row whose address does not fit its platform.
 *
 * @param entry - The row.
 * @param messages - The editor's copy.
 * @returns The message, or `null` while the row is incomplete or fits.
 */
function getEntryError(entry: Entry, messages: SocialMediaEditorMessages): string | null {
  if (!entry.platform || !entry.url.trim()) return null;
  if (normalizeSocialMediaValue(entry.platform, entry.url)) return null;
  const platformLabel = PLATFORM_MAP.get(entry.platform)?.label ?? entry.platform;
  return messages.invalidUrlMessage(platformLabel);
}

/** The number the next row's key is made from. */
let nextEntryId = 0;

/**
 * A key for a new row.
 *
 * @returns A key no other row on the page has.
 */
function genId(): string {
  return `sme-${++nextEntryId}`;
}

/**
 * The rows for a list of addresses, with one empty row when there are none.
 *
 * @param links - The stored addresses.
 * @returns The rows.
 */
function linksToEntries(links: SocialMediaLinks): Entry[] {
  const entries: Entry[] = links.map((link) => ({ id: genId(), ...link }));
  if (entries.length === 0) entries.push({ id: genId(), platform: "", url: "" });
  return entries;
}

/**
 * The addresses the complete rows name, in their order.
 *
 * @param entries - The rows.
 * @returns The rows that have both a platform and an address.
 */
function entriesToLinks(entries: Entry[]): SocialMediaLinks {
  const links: SocialMediaLinks = [];
  for (const entry of entries) {
    if (entry.platform && entry.url) links.push({ platform: entry.platform, url: entry.url });
  }
  return links;
}

/**
 * The address the open button follows.
 *
 * @param entry - The row.
 * @returns The row's address in canonical form where it has one, otherwise as
 *   typed, or `null` when it does not parse.
 */
function getOpenUrl(entry: Entry): string | null {
  const trimmed = entry.url.trim();
  if (!trimmed) return null;
  const normalized = entry.platform ? normalizeSocialMediaValue(entry.platform, trimmed) : null;
  const candidate = normalized ?? trimmed;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

/**
 * Editor for the list of addresses where somebody can be found.
 *
 * Each row shows the platform recognised from the address, the address itself,
 * and a button to remove the row. Clicking the icon opens the list of platforms
 * so the recognised one can be overruled.
 *
 * A platform may appear on more than one row, because somebody may have two
 * websites or two accounts on the same network. The rows keep the order they
 * were entered in, and that order is what the site shows.
 */
export function SocialMediaEditor({
  value,
  onChange,
  messages,
  blurOnPaste = false,
  favicons,
}: SocialMediaEditorProps) {
  const [entryState, replaceEntryState] = useReducer(
    (_current: { entries: Entry[]; lastEmitted: string }, next: { entries: Entry[]; lastEmitted: string }) => next,
    value,
    (initialValue) => ({
      entries: linksToEntries(initialValue),
      lastEmitted: JSON.stringify(initialValue),
    }),
  );
  const { entries } = entryState;
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const triggerRefs = useRef<Map<string, HTMLButtonElement> | null>(null);
  const inputRefs = useRef<Map<string, HTMLInputElement> | null>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  triggerRefs.current ??= new Map();
  inputRefs.current ??= new Map();

  // A value that did not come from this editor, such as a reset by the parent,
  // replaces the rows. It is adjusted while rendering rather than in an
  // effect, so the stale rows are never painted; a value this editor emitted
  // itself matches `lastEmitted` and keeps the rows, half-typed ones included.
  const serializedValue = JSON.stringify(value);
  if (serializedValue !== entryState.lastEmitted) {
    replaceEntryState({ entries: linksToEntries(value), lastEmitted: serializedValue });
  }

  useEffect(() => {
    if (!openDropdownId) return;
    const capturedId = openDropdownId;
    function onMouseDown(event: MouseEvent) {
      const trigger = triggerRefs.current?.get(capturedId);
      if (portalRef.current?.contains(event.target as Node) || trigger?.contains(event.target as Node)) {
        return;
      }
      setOpenDropdownId(null);
      setDropdownRect(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openDropdownId]);

  function toggleDropdown(entryId: string) {
    if (openDropdownId === entryId) {
      setOpenDropdownId(null);
      setDropdownRect(null);
      return;
    }
    const trigger = triggerRefs.current?.get(entryId);
    if (trigger) {
      setDropdownRect(trigger.getBoundingClientRect());
      setOpenDropdownId(() => entryId);
    }
  }

  function emit(next: Entry[]) {
    const links = entriesToLinks(next);
    replaceEntryState({ entries: next, lastEmitted: JSON.stringify(links) });
    onChange(links);
  }

  function addEntry() {
    const nextEntry: Entry = { id: genId(), platform: "", url: "" };
    emit([...entries, nextEntry]);
    requestAnimationFrame(() => inputRefs.current?.get(nextEntry.id)?.focus());
  }

  function removeEntry(id: string) {
    if (openDropdownId === id) {
      setOpenDropdownId(null);
      setDropdownRect(null);
    }
    emit(entries.filter((entry) => entry.id !== id));
  }

  function selectPlatform(id: string, platform: SocialPlatformKey) {
    emit(entries.map((entry) => (entry.id === id ? { ...entry, platform } : entry)));
    setOpenDropdownId(null);
    setDropdownRect(null);
  }

  function updateUrl(id: string, url: string) {
    // Sorted the way the rest of the codebase sorts an address, so a fediverse
    // handle such as `@kim@chaos.social` is recognised here too. Reading it as
    // a URL cannot work: the instance is somebody's own domain, so no table
    // holds it, and the `@kim@` in front parses as userinfo.
    const detected = detectProfilePlatform(url);
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) return;

    // A bare handle is answered as Mastodon because that is the common case,
    // but a Pixelfed and a Friendica handle are written identically. So it
    // fills an empty choice and never overrules one somebody made by hand.
    const overrulesChoice = detected !== null && !isFediverseHandle(url);

    // Auto-detect platform, but only if user hasn't manually overridden
    // or if the current platform is empty/website (generic fallback)
    const shouldAutoDetect = !entry.platform || entry.platform === WEBSITE_PLATFORM || overrulesChoice;
    const platform = shouldAutoDetect ? (detected ?? (url.trim() ? WEBSITE_PLATFORM : "")) : entry.platform;

    emit(entries.map((candidate) => (candidate.id === id ? { ...candidate, url, platform } : candidate)));
  }

  function normalizeUrl(id: string) {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry?.platform || !entry.url) return;
    const normalized = normalizeSocialMediaValue(entry.platform, entry.url);
    if (normalized && normalized !== entry.url) {
      emit(entries.map((candidate) => (candidate.id === id ? { ...candidate, url: normalized } : candidate)));
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    if (!blurOnPaste) return;
    const pastedText = event.clipboardData.getData("text").trim();
    if (!pastedText) return;
    const input = event.currentTarget;
    requestAnimationFrame(() => {
      input.blur();
    });
  }

  const openEntryPlatform = entries.find((entry) => entry.id === openDropdownId)?.platform;

  const btnClass =
    "shrink-0 flex items-center justify-center w-9 border border-[var(--ds-border)] rounded-control transition-colors";

  const dropdown =
    openDropdownId && dropdownRect
      ? createPortal(
          <div
            ref={portalRef}
            style={{
              position: "fixed",
              top: dropdownRect.bottom + 4,
              left: dropdownRect.left,
              width: 192,
              zIndex: 50,
              backgroundColor: "var(--ds-input-bg, #ffffff)",
            }}
            className="border border-[var(--ds-border)] rounded-control shadow-lg overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto py-1">
              {PLATFORMS.map((platform) => {
                const isSelected = openEntryPlatform === platform.key;
                return (
                  <button
                    key={platform.key}
                    type="button"
                    onClick={() => selectPlatform(openDropdownId, platform.key)}
                    className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-sm transition-colors ${
                      isSelected
                        ? "text-[var(--ds-text)] bg-white/8"
                        : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] hover:bg-white/8"
                    }`}
                  >
                    <platform.icon size={14} />
                    {platform.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry) => {
        const def = PLATFORM_MAP.get(entry.platform);
        const Icon = def?.icon ?? GlobeIcon;
        // A site's own mark tells two websites apart, which two globes do not.
        const favicon = entry.platform === WEBSITE_PLATFORM ? favicons?.[entry.url] : undefined;
        const entryError = getEntryError(entry, messages);
        const openUrl = getOpenUrl(entry);

        return (
          <div key={entry.id} className="flex flex-col gap-1">
            <div className="flex gap-2">
              {/* Platform icon (click to override) + URL input */}
              <div
                className={`flex flex-1 border rounded-control bg-[var(--ds-form-control-bg,var(--ds-input-bg))] transition-colors focus-within:ring-2 ${
                  entryError
                    ? "border-red-400 focus-within:ring-red-400/40"
                    : "border-[var(--ds-border)] focus-within:ring-[var(--color-primary)]"
                }`}
              >
                <button
                  type="button"
                  ref={(element) => {
                    if (element) triggerRefs.current?.set(entry.id, element);
                    else triggerRefs.current?.delete(entry.id);
                  }}
                  onClick={() => toggleDropdown(entry.id)}
                  aria-label={messages.selectPlatformAriaLabel}
                  className="shrink-0 w-10 flex items-center justify-center border-r border-[var(--ds-border)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-form-control-bg,var(--ds-bg-elevated))] transition-colors"
                >
                  {favicon ? (
                    <img
                      src={favicon}
                      alt=""
                      width={16}
                      height={16}
                      className="rounded-[2px] object-contain"
                      style={{ width: 16, height: 16 }}
                    />
                  ) : (
                    <Icon size={16} />
                  )}
                </button>

                <input
                  aria-label={messages.urlPlaceholder}
                  ref={(element) => {
                    if (element) inputRefs.current?.set(entry.id, element);
                    else inputRefs.current?.delete(entry.id);
                  }}
                  type="text"
                  value={entry.url}
                  onChange={(event) => updateUrl(entry.id, event.target.value)}
                  onPaste={handlePaste}
                  onBlur={() => normalizeUrl(entry.id)}
                  placeholder={messages.urlPlaceholder}
                  className="flex-1 px-3 py-1.5 text-sm bg-transparent text-[var(--ds-text)] placeholder:text-[var(--ds-text-subtle)] focus:outline-none"
                />
              </div>

              {/* Remove entry */}
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                aria-label={messages.removeAriaLabel}
                className={`${btnClass} text-[var(--ds-text-muted)] hover:border-red-400 hover:text-red-500`}
              >
                <MinusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
              </button>

              {/* Add entry */}
              <button
                type="button"
                onClick={addEntry}
                aria-label={messages.addAriaLabel}
                title={messages.addAriaLabel}
                className={`${btnClass} text-[var(--ds-text-muted)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]`}
              >
                <PlusCircleIcon weight="duotone" className="w-3.5 h-3.5" />
              </button>

              {/* Open URL */}
              <button
                type="button"
                onClick={() => {
                  if (!openUrl) return;
                  window.open(openUrl, "_blank", "noopener,noreferrer");
                }}
                aria-label={messages.openAriaLabel}
                title={messages.openAriaLabel}
                disabled={!openUrl}
                className={`${btnClass} ${
                  openUrl
                    ? "text-[var(--ds-text-muted)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
                    : "border-[var(--ds-border)] bg-[var(--ds-form-control-bg,var(--ds-bg-elevated))] text-[var(--ds-text-subtle)] cursor-not-allowed"
                }`}
              >
                <ArrowSquareOutIcon weight="duotone" className="w-3.5 h-3.5" />
              </button>
            </div>
            {entryError && <p className="text-xs text-red-500">{entryError}</p>}
          </div>
        );
      })}

      {entries.length === 0 && (
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1.5 text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text)] transition-colors self-start"
        >
          <PlusCircleIcon weight="duotone" className="w-3 h-3" />
          {messages.addAriaLabel}
        </button>
      )}

      {dropdown}
    </div>
  );
}
