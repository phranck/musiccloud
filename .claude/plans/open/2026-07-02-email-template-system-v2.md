# Email-Template-System v2 — Implementation Plan (Phase 1)

Plan-Nr.: MC-078

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block-basierter Email-Body, zentral gepflegtes globales Header/Footer-Branding, eigene Bild-Ablage (bytea + Streaming-Route) und eine code-definierte System-Action-Registry, über die Admin-Mails lose mit Templates verknüpft werden — inkl. verlustfreier Migration der bestehenden „New User"-Vorlage und Umstellung des Admin-Invite-Flows auf `triggerEmailAction`.

**Architecture:** Vier DB-Änderungen (neue Tabellen `email_branding`, `email_assets`, `email_action_bindings` + Umbau `email_templates` von Feldern auf `blocks`-JSONB). Block-Typen und Action-Registry liegen in `@musiccloud/shared` (von Backend + Dashboard konsumiert); der Renderer baut denselben HTML-Rahmen wie heute, aber aus Blöcken; `triggerEmailAction` ersetzt die festverdrahteten Sende-Aufrufe. Dashboard bekommt einen Block-Editor, eine Branding-Seite und eine „Actions"-Seite (Liste+Detail) unter „System".

**Tech Stack:** Fastify, Drizzle (Postgres, `bytea` via `customType`), `@musiccloud/shared`, React + TanStack Query + `@dnd-kit` (Dashboard), vitest, `marked` (Markdown).

**Scope:** Nur Phase 1 aus [email-template-system-design.md](../../../docs/superpowers/specs/2026-07-01-email-template-system-design.md). Phase 2 (Migration der Developer-Portal-Auth-Mails verify/reset/danger-zone aus `developer-email.ts`) ist ein eigener Folge-Plan, geschrieben nachdem Button-Block + Variablen-Validierung hier stehen.

---

## Verifizierte Fakten (2026-07-02)

Alle Referenzen per direktem Read/Grep/psql gegen den aktuellen Code + die Prod-DB verifiziert.

- **Migrationen:** höchste vorhandene `0048_clumsy_carnage.sql`; Journal (`meta/_journal.json`) endet bei `idx: 48`. Nächste generierte Nummer `0049`. Hand-authored SQL-Migrationen sind im Repo etabliert (`0046_cleanup_release_dates.sql`, mit eigenem Journal-Eintrag) — Vorlage für die Daten-Backfill-Migration.
- **Schema** `apps/backend/src/db/schemas/postgres.ts`: `emailTemplates` (`:957-969`); `bytea`-Helper via `customType` (`:24-28`); `genre_artworks.jpeg` als bytea-Präzedenz (`:944`). Importiert bereits `boolean, check, customType, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex` + `sql` (`:1-17`) — keine neuen Imports nötig.
- **bytea-Serving-Pattern** `apps/backend/src/routes/genre-artwork.ts`: `reply.code(200).header("Content-Type", "image/jpeg").header("Cache-Control", "public, max-age=31536000, immutable").send(buffer)`.
- **Prod-Daten (`email_templates`, verifiziert via VPN 2026-07-02):** genau **eine** Zeile. `id=1`, `name="New User"`, `subject="Your login details for musiccloud.io"`, `header_banner_url="/email-header.jpg"`, `header_text=""` (leer), `body_text=` Markdown mit `{{username}}` und `{{inviteUrl}}` (289 Zeichen), `footer_banner_url=""` (leer), `footer_text="share it everywhere"`, `is_system_template=false`. Die Migration muss diese Zeile **verlustfrei** überführen.
- **Repository-Contract** `apps/backend/src/db/admin-repository.ts`: `EmailTemplateRow` (`:115-127`), `EmailTemplateWriteData` (`:130-139`), Methoden-Signaturen (`:570-606`).
- **Adapter** `apps/backend/src/db/adapters/postgres-content-email.ts` (223 Zeilen, komplett gelesen): `listEmailTemplates`/`getEmailTemplateById`/`getEmailTemplateByName`/`insertEmailTemplate`/`updateEmailTemplate`/`deleteEmailTemplate`, snake_case↔camelCase-Mapper. `PostgresAdapter` (`postgres.ts:258` `implements ... AdminRepository ...`) delegiert.
- **Service** `apps/backend/src/services/email-templates.ts` (CRUD über `getAdminRepository`), `apps/backend/src/services/email-renderer.ts` (`buildRows`/`renderEmailTemplate`/`renderEmailPreview`/`interpolate`/`resolveAssetUrl`/`parseMarkdown`/`applyInlineStyles`/`DARK_RULES`/`DARK_MODE_CSS`, komplett gelesen), `apps/backend/src/services/email-sender.ts` (`sendTemplatedEmail`).
- **Routen** `apps/backend/src/routes/admin-email-templates.ts` (294 Zeilen, komplett gelesen): list/export/detail/create/update/preview/import/test/delete. Preview nutzt `renderEmailPreview(fields, colorScheme, requireEnv("PUBLIC_URL"))`.
- **Endpoints** `packages/shared/src/endpoints.ts`: `admin.emailTemplates.*` (`:259-272`), `ROUTE_TEMPLATES.admin.emailTemplates` (`:454-457`).
- **Invite-Flow** `apps/backend/src/routes/admin-users.ts:121-133`: sendet `sendTemplatedEmail({ templateId: body.welcomeTemplateId, ... })` — **frei wählbares** Template pro Einladung. `welcomeTemplateId` referenziert in `apps/dashboard/src/features/system/UserCreateCard.tsx`, `apps/dashboard/src/features/system/hooks/useAdminUsers.ts`, `admin-users.ts`. Entscheidung: Picker entfällt, Invite nutzt `triggerEmailAction(EmailAction.AdminInviteSent, …)`.
- **Dashboard-Sidebar** `apps/dashboard/src/components/layout/Sidebar.tsx:744-789`: „System"-Sektion mit flachen `NavLink`s (`/users`, `/services`, `/system`, `/design`). Routen in `apps/dashboard/src/routes.tsx:55-70`. Neuer Eintrag „Actions" reiht sich dort ein.
- **dnd-kit** vorhanden (`@dnd-kit/core@^6.3.1`, `/sortable@^10`, `/utilities@^3.2.2`); Sortier-Pattern in `apps/dashboard/src/features/content/navigation/NavManagerPage.tsx` (`DndContext`/`SortableContext`/`useSortable`/`arrayMove`/`PointerSensor`+`KeyboardSensor`/`handleDragEnd`).
- **api-Client** `apps/dashboard/src/lib/api.ts`: `get`/`post`/`put`/`patch`/`delete`.
- **Dashboard-Contract** `apps/dashboard/src/shared/contracts/admin-email-templates.ts` (`EmailTemplate`-Interface); **Hooks** `apps/dashboard/src/features/templates/hooks/useEmailTemplates.ts`; **Edit-Page** `EmailTemplateEditPage.tsx`, **Preview** `EmailPreview.tsx`.
- **i18n** `apps/dashboard/src/i18n/messages.ts`: `de` (`:734`), `en` (`:1440`), `emailTemplates`-Block (`:621`).
- **pnpm** ist PM (`pnpm@10.33.1`). Backend-Typecheck: `pnpm --filter @musiccloud/backend typecheck`. Shared-Build: `pnpm --filter @musiccloud/shared build`. Lint: `pnpm lint` (Biome). Tests: `pnpm --filter @musiccloud/backend test:run`. Migration generieren: `pnpm db:generate`. Lokal anwenden: Backend-Restart (Heartbeat) oder `pnpm db:migrate`.
- [ ] Alle Referenzen erneut gegen den aktuellen Code + Prod verifiziert vor dem ersten Edit.
- [ ] Vor jeder DB-Änderung: aktuellen Prod-Stand via `/db-dump` lokal gespiegelt (die Backfill-Migration muss gegen die echte „New User"-Zeile getestet werden, nicht gegen eine leere lokale DB).

---

## Task 1: Shared — Block-Typen + Action-Registry

**Files:**
- Create: `packages/shared/src/email-blocks.ts`
- Create: `packages/shared/src/email-actions.ts`
- Modify: `packages/shared/src/index.ts` (Re-Export)
- Test: `packages/shared/src/__tests__/email-blocks.test.ts`

- [x] **Step 1: Block-Typen + Validierung schreiben**

Create `packages/shared/src/email-blocks.ts`:

```typescript
/**
 * @file Email-Body-Block-Modell (MC-078). Der Body eines Templates ist ein
 * geordnetes Array dieser Blöcke; Backend-Renderer und Dashboard-Editor
 * teilen sich diese Typen, damit gespeicherte und gerenderte Struktur nie
 * auseinanderlaufen.
 */

/** Diskriminanten-Namespace der Block-Typen (PascalCase-Members, project domain-literals policy). */
export const EmailBlockType = {
  /** Markdown-Text (Überschrift/Absatz), interpoliert `{{var}}`. */
  Text: "text",
  /** Call-to-Action-Button; `url` interpoliert `{{var}}`. */
  Button: "button",
  /** Bild aus {@link email_assets}, referenziert per `assetId`. */
  Image: "image",
  /** Horizontale Trennlinie. */
  Divider: "divider",
  /** Vertikaler Leerraum fester Höhe. */
  Spacer: "spacer",
} as const;

/** Ein {@link EmailBlockType}-Wert. */
export type EmailBlockTypeValue = (typeof EmailBlockType)[keyof typeof EmailBlockType];

/** Text-Block: Markdown, `{{var}}`-interpoliert. */
export interface EmailTextBlock {
  type: typeof EmailBlockType.Text;
  markdown: string;
}
/** Button-Block: sichtbares Label + Ziel-URL (`{{var}}`-interpoliert). */
export interface EmailButtonBlock {
  type: typeof EmailBlockType.Button;
  label: string;
  url: string;
}
/** Bild-Block: Asset-Referenz + Alt-Text. */
export interface EmailImageBlock {
  type: typeof EmailBlockType.Image;
  assetId: string;
  altText: string;
}
/** Trennlinie ohne Konfiguration. */
export interface EmailDividerBlock {
  type: typeof EmailBlockType.Divider;
}
/** Leerraum-Block mit Pixel-Höhe. */
export interface EmailSpacerBlock {
  type: typeof EmailBlockType.Spacer;
  heightPx: number;
}

/** Ein Body-Block. */
export type EmailBlock =
  | EmailTextBlock
  | EmailButtonBlock
  | EmailImageBlock
  | EmailDividerBlock
  | EmailSpacerBlock;

/**
 * Prüft, ob ein unbekannter Wert ein wohlgeformtes `EmailBlock[]` ist. Nutzt
 * die Route-/Service-Schicht zur Body-Validierung, bevor Blöcke persistiert
 * oder gerendert werden.
 *
 * @param value - zu prüfender Wert (typisch aus einem JSON-Body / einer DB-Spalte).
 * @returns `true` nur, wenn jedes Element ein gültiger Block ist.
 */
export function isEmailBlockArray(value: unknown): value is EmailBlock[] {
  if (!Array.isArray(value)) return false;
  return value.every((b) => {
    if (!b || typeof b !== "object") return false;
    const block = b as Record<string, unknown>;
    switch (block.type) {
      case EmailBlockType.Text:
        return typeof block.markdown === "string";
      case EmailBlockType.Button:
        return typeof block.label === "string" && typeof block.url === "string";
      case EmailBlockType.Image:
        return typeof block.assetId === "string" && typeof block.altText === "string";
      case EmailBlockType.Divider:
        return true;
      case EmailBlockType.Spacer:
        return typeof block.heightPx === "number" && Number.isFinite(block.heightPx);
      default:
        return false;
    }
  });
}
```

Create `packages/shared/src/email-actions.ts`:

```typescript
/**
 * @file System-Action-Registry für ausgehende Mails (MC-078). Eine Action ist
 * ein benanntes Ereignis im System (z.B. „Admin-Einladung versendet"), das
 * einen festen Satz Template-Variablen liefert. Templates werden über
 * `email_action_bindings` lose an Actions gebunden; der Backend-Trigger
 * (`services/email-actions.ts`) rendert + sendet alle gebundenen Templates.
 *
 * Diese Registry ist die einzige Quelle der Wahrheit für Action-Keys und ihre
 * Variablen — Dashboard (Actions-Seite) und Backend (Trigger, Kompatibilitäts-
 * Check) konsumieren sie beide.
 */

/** Metadaten einer System-Action. */
export interface EmailActionMeta {
  /** Stabiler Key, persistiert in `email_action_bindings.action_key`. */
  key: string;
  /** Menschlich lesbares Label (Dashboard-Anzeige). */
  label: string;
  /** Variablennamen, die diese Action beim Auslösen bereitstellt. */
  variables: string[];
  /** Wenn `true`, muss mindestens ein aktiviertes Template gebunden sein, sonst wirft der Trigger. */
  required: boolean;
}

/** Alle System-Actions, keyed by ihren stabilen `key`. */
export const EMAIL_ACTIONS = {
  adminInviteSent: {
    key: "adminInviteSent",
    label: "Admin invite sent",
    variables: ["username", "email", "role", "inviteUrl", "loginUrl"],
    required: true,
  },
} as const satisfies Record<string, EmailActionMeta>;

/** Ein Action-Key aus {@link EMAIL_ACTIONS}. */
export type EmailActionKey = keyof typeof EMAIL_ACTIONS;

/** Bequemer Namespace für Action-Keys (statt Magic-Strings an Call-Sites). */
export const EmailAction = {
  AdminInviteSent: "adminInviteSent",
} as const satisfies Record<string, EmailActionKey>;

/** Liefert die Metadaten zu einem Key, oder `undefined` bei unbekanntem Key. */
export function getEmailActionMeta(key: string): EmailActionMeta | undefined {
  return (EMAIL_ACTIONS as Record<string, EmailActionMeta>)[key];
}
```

> **Hinweis Phase 2:** `verify:developer`, `reset:developer`, `deleted:developer` kommen im Folge-Plan dazu; hier bewusst nur `adminInviteSent`, da nur der Invite-Flow in Phase 1 auf den Trigger umgestellt wird.

- [x] **Step 2: Re-Export ergänzen**

In `packages/shared/src/index.ts` (bestehendes Re-Export-Muster spiegeln) hinzufügen:

```typescript
export * from "./email-blocks.js";
export * from "./email-actions.js";
```

- [x] **Step 3: Test schreiben**

Create `packages/shared/src/__tests__/email-blocks.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { EmailBlockType, isEmailBlockArray } from "../email-blocks.js";
import { EMAIL_ACTIONS, EmailAction, getEmailActionMeta } from "../email-actions.js";

describe("isEmailBlockArray", () => {
  it("accepts a well-formed mixed block array", () => {
    expect(
      isEmailBlockArray([
        { type: EmailBlockType.Text, markdown: "Hi {{username}}" },
        { type: EmailBlockType.Button, label: "Open", url: "{{inviteUrl}}" },
        { type: EmailBlockType.Image, assetId: "a1", altText: "" },
        { type: EmailBlockType.Divider },
        { type: EmailBlockType.Spacer, heightPx: 24 },
      ]),
    ).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(isEmailBlockArray({})).toBe(false);
  });

  it("rejects a button block missing url", () => {
    expect(isEmailBlockArray([{ type: EmailBlockType.Button, label: "x" }])).toBe(false);
  });

  it("rejects an unknown block type", () => {
    expect(isEmailBlockArray([{ type: "video", src: "x" }])).toBe(false);
  });
});

describe("email actions registry", () => {
  it("exposes adminInviteSent as required with its variables", () => {
    const meta = getEmailActionMeta(EmailAction.AdminInviteSent);
    expect(meta).toBeDefined();
    expect(meta!.required).toBe(true);
    expect(meta!.variables).toContain("inviteUrl");
  });

  it("returns undefined for an unknown key", () => {
    expect(getEmailActionMeta("nope")).toBeUndefined();
  });

  it("key namespace matches registry keys", () => {
    expect(EMAIL_ACTIONS[EmailAction.AdminInviteSent].key).toBe(EmailAction.AdminInviteSent);
  });
});
```

- [x] **Step 4: Bauen + testen**

Run: `pnpm --filter @musiccloud/shared build && pnpm --filter @musiccloud/shared test:run`
Expected: Build ok, alle Tests grün.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/email-blocks.ts packages/shared/src/email-actions.ts packages/shared/src/index.ts packages/shared/src/__tests__/email-blocks.test.ts
git commit -m "Feat: shared email-block + system-action types (MC-078)"
```

---

## Task 2: Schema — neue Tabellen + additive Spalten

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts` (nach `emailTemplates`, `:969`)

- [x] **Step 1: Singleton-Branding, Assets, additive Template-Spalten, Bindings anlegen**

Direkt nach `export type EmailTemplateInsert = ...` (`:972`) einfügen:

```typescript
/**
 * Global email branding (MC-078): a single row carrying the header/footer
 * assets and footer text wrapped around EVERY rendered template. The app
 * always reads/writes the lowest-id row; the migration seeds exactly one.
 */
export const emailBranding = pgTable("email_branding", {
  id: serial("id").primaryKey(),
  headerAssetId: text("header_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerAssetId: text("footer_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerText: text("footer_text"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailBrandingRow = typeof emailBranding.$inferSelect;
export type EmailBrandingInsert = typeof emailBranding.$inferInsert;

/**
 * Binary email images (MC-078). Mirrors {@link genreArtworks}: bytes live in
 * Postgres, served by `GET /api/admin/email-assets/:id` with a long immutable
 * cache. Referenced by {@link emailBranding} and by `image` body-blocks.
 */
export const emailAssets = pgTable("email_assets", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailAssetRow = typeof emailAssets.$inferSelect;
export type EmailAssetInsert = typeof emailAssets.$inferInsert;

/**
 * Binds a system action (code-defined, see `@musiccloud/shared` EMAIL_ACTIONS)
 * to a template (MC-078). Many-to-many: one action fans out to every enabled
 * binding's template; a template may be bound to several actions.
 */
export const emailActionBindings = pgTable(
  "email_action_bindings",
  {
    id: text("id").primaryKey(),
    actionKey: text("action_key").notNull(),
    templateId: integer("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_email_action_bindings_action_template").on(table.actionKey, table.templateId),
    index("idx_email_action_bindings_action").on(table.actionKey),
  ],
);

export type EmailActionBindingRow = typeof emailActionBindings.$inferSelect;
export type EmailActionBindingInsert = typeof emailActionBindings.$inferInsert;
```

In der `emailTemplates`-Definition (`:957-969`) zwei **nullable** Spalten ergänzen (nullable, damit die additive Migration ohne Default-Backfill durchläuft; NOT-NULL folgt in Task 4):

```typescript
  blocks: jsonb("blocks"),
  requiredVariables: jsonb("required_variables"),
```

- [x] **Step 2: Migration generieren**

Run: `pnpm db:generate`
Expected: neue Datei `apps/backend/src/db/migrations/postgres/0049_*.sql` mit `CREATE TABLE email_branding|email_assets|email_action_bindings` + `ALTER TABLE email_templates ADD COLUMN blocks jsonb, ADD COLUMN required_variables jsonb`. Bei Drift-/Snapshot-Prompt: stoppen und Konflikt berichten.

- [x] **Step 3: Backend-Typecheck**

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: keine Fehler.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts apps/backend/src/db/migrations/postgres
git commit -m "Feat: add email_branding/assets/action_bindings schema + blocks columns (MC-078)"
```

---

## Task 3: Daten-Backfill-Migration (verlustfrei)

**Files:**
- Create: `apps/backend/src/db/migrations/postgres/0050_backfill_email_template_blocks.sql`
- Modify: `apps/backend/src/db/migrations/postgres/meta/_journal.json`

- [x] **Step 1: Hand-authored SQL-Migration schreiben**

Create `apps/backend/src/db/migrations/postgres/0050_backfill_email_template_blocks.sql` (Muster: `0046_cleanup_release_dates.sql`):

```sql
-- Custom SQL migration file, put your code below! --

-- MC-078: migrate the field-based email_templates onto the block model, and
-- lift the (previously per-template) footer text into the new global branding
-- singleton. Header/footer BANNER images are intentionally NOT carried over as
-- bytes here (SQL cannot read the repo image file); the admin re-uploads the
-- header on the new Branding page after deploy. The banner URL columns are
-- dropped in the next migration.

-- 1) Seed the single global branding row. Take the footer text from whichever
--    existing template carried one (there is exactly one row in prod:
--    "share it everywhere"). Header/footer assets start NULL.
INSERT INTO "email_branding" ("footer_text")
VALUES ((SELECT "footer_text" FROM "email_templates"
         WHERE "footer_text" IS NOT NULL AND "footer_text" <> '' LIMIT 1));

-- 2) Convert each template's header_text (if any) + body_text into text blocks,
--    preserving order and content verbatim. required_variables starts empty:
--    the interpolation still replaces {{username}}/{{inviteUrl}} from the
--    triggering action's variables; requiredVariables only gates validation and
--    an empty list is the safe permissive default (admin can declare later).
UPDATE "email_templates"
   SET "blocks" = CASE
         WHEN COALESCE("header_text", '') <> '' THEN
           jsonb_build_array(
             jsonb_build_object('type', 'text', 'markdown', "header_text"),
             jsonb_build_object('type', 'text', 'markdown', "body_text")
           )
         ELSE
           jsonb_build_array(
             jsonb_build_object('type', 'text', 'markdown', "body_text")
           )
       END,
       "required_variables" = '[]'::jsonb
 WHERE "blocks" IS NULL;
```

- [x] **Step 2: Journal-Eintrag ergänzen**

In `apps/backend/src/db/migrations/postgres/meta/_journal.json` nach dem `idx: 48`-Objekt (mirror the `0046`-style entry; `when` = fester Timestamp, da `Date.now()` in diesem Kontext nicht relevant — nimm den Wert aus dem `git`-Commit-Zeitpunkt oder einen monoton größeren als 1782901306731, z.B. `1782987706731`):

```json
    {
      "idx": 49,
      "version": "7",
      "when": 1782987706731,
      "tag": "0050_backfill_email_template_blocks",
      "breakpoints": true
    }
```

> **Achtung:** `idx` ist der Journal-Index (fortlaufend, hier `49`, da `0048` = idx 48 und `0049_*` = idx 49 belegt) — **prüfe die tatsächlichen idx-Werte** nach `pnpm db:generate` aus Task 2: die generierte `0049`-Migration hat bereits idx 49 belegt, diese Backfill-Migration ist dann idx **50**, `tag` bleibt der Dateiname ohne `.sql`. Setze `idx` auf den nächsthöheren freien Wert und `tag` exakt auf den Dateinamen.

- [x] **Step 3: Prod-Stand lokal spiegeln, dann migrieren**

Run (Prod-Daten lokal spiegeln, damit die echte „New User"-Zeile vorliegt): `/db-dump`
Dann Backend neu starten (Heartbeat wendet 0049 + 0050 an) oder: `pnpm db:migrate`
Expected: `[DB] All migrations applied successfully`.

> Umsetzungshinweis: `/db-dump` selbst nicht nötig gewesen — vor der Migration verifiziert (`psql`, direkter Zeilenvergleich), dass die lokale DB die „New User"-Zeile bereits byte-identisch zu Prod enthielt (gleicher `header_banner_url`, `body_text`, `footer_text`). Migration direkt gegen die lokale DB angewendet, Ergebnis gegen die per VPN gelesenen Prod-Werte gegengeprüft.

- [x] **Step 4: Backfill verifizieren**

Run:
```bash
psql "postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud" -x -c \
"SELECT id, name, blocks, required_variables FROM email_templates WHERE id = 1;" -c \
"SELECT id, footer_text, header_asset_id FROM email_branding;"
```
Expected: `blocks` = ein `text`-Block mit dem originalen `body_text` (inkl. `{{username}}`/`{{inviteUrl}}`), `required_variables` = `[]`; `email_branding` = eine Zeile mit `footer_text = "share it everywhere"`, `header_asset_id = null`.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/db/migrations/postgres/0050_backfill_email_template_blocks.sql apps/backend/src/db/migrations/postgres/meta/_journal.json
git commit -m "Feat: backfill email_templates onto block model + seed global branding (MC-078)"
```

---

## Task 4: Schema — alte Spalten droppen, blocks NOT NULL

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts` (`emailTemplates`)

- [x] **Step 1: Feld-Spalten entfernen, blocks/requiredVariables NOT NULL setzen**

In `emailTemplates` die fünf alten Spalten (`headerBannerUrl`, `headerText`, `footerBannerUrl`, `footerText`, `bodyText`) löschen und die zwei neuen auf NOT NULL mit Default `'[]'` heben:

```typescript
  blocks: jsonb("blocks").notNull().default([]),
  requiredVariables: jsonb("required_variables").notNull().default([]),
```

- [x] **Step 2: Migration generieren**

Run: `pnpm db:generate`
Expected: `0051_*.sql` mit `ALTER TABLE email_templates DROP COLUMN header_banner_url|header_text|body_text|footer_banner_url|footer_text`, `ALTER COLUMN blocks SET NOT NULL SET DEFAULT ...`. Da der Backfill in Task 3 alle Zeilen befüllt hat, ist SET NOT NULL sicher.

- [x] **Step 3: Anwenden + verifizieren**

Backend-Restart oder `pnpm db:migrate`. Dann:
```bash
psql "postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud" -c "\d email_templates"
```
Expected: nur noch `id, name, subject, is_system_template, created_at, updated_at, blocks, required_variables`.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts apps/backend/src/db/migrations/postgres
git commit -m "Feat: drop legacy email_templates field columns, enforce blocks NOT NULL (MC-078)"
```

---

## Task 5: Repository-Contract + Adapter (Templates/Branding/Assets/Bindings)

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts` (`EmailTemplateRow`/`EmailTemplateWriteData` `:115-139`, Interface `:570-606`)
- Modify: `apps/backend/src/db/adapters/postgres-content-email.ts`
- Modify: `apps/backend/src/db/adapters/postgres.ts` (Delegation)

- [x] **Step 1: DTOs im Contract umstellen + neue DTOs**

In `admin-repository.ts` `EmailTemplateRow` (`:115-127`) und `EmailTemplateWriteData` (`:130-139`) die fünf Feld-Properties durch `blocks`/`requiredVariables` ersetzen:

```typescript
import type { EmailBlock } from "@musiccloud/shared";

/** A declared template variable: name + human description shown in the editor. */
export interface EmailTemplateVariable {
  name: string;
  description: string;
}

export interface EmailTemplateRow {
  id: number;
  name: string;
  subject: string;
  blocks: EmailBlock[];
  requiredVariables: EmailTemplateVariable[];
  isSystemTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailTemplateWriteData {
  name: string;
  subject: string;
  blocks: EmailBlock[];
  requiredVariables?: EmailTemplateVariable[];
  isSystemTemplate?: boolean;
}

/** Global branding singleton. */
export interface EmailBrandingDto {
  headerAssetId: string | null;
  footerAssetId: string | null;
  footerText: string | null;
}

/** An issued email image asset (metadata; bytes fetched separately). */
export interface EmailAssetDto {
  id: string;
  mimeType: string;
  createdAt: Date;
}

/** A binding of an action key to a template. */
export interface EmailActionBindingDto {
  id: string;
  actionKey: string;
  templateId: number;
  enabled: boolean;
}
```

Im `AdminRepository`-Interface (`:570-606`) die bestehenden 6 Email-Template-Signaturen belassen (Typen ändern sich automatisch über die DTOs) und ergänzen:

```typescript
  // Email branding (singleton)
  getEmailBranding(): Promise<EmailBrandingDto>;
  updateEmailBranding(data: Partial<EmailBrandingDto>): Promise<EmailBrandingDto>;
  // Email assets
  insertEmailAsset(data: { mimeType: string; bytes: Buffer }): Promise<EmailAssetDto>;
  getEmailAssetBytes(id: string): Promise<{ mimeType: string; bytes: Buffer } | null>;
  // Action bindings
  listEmailActionBindings(actionKey?: string): Promise<EmailActionBindingDto[]>;
  createEmailActionBinding(data: { actionKey: string; templateId: number }): Promise<EmailActionBindingDto>;
  setEmailActionBindingEnabled(id: string, enabled: boolean): Promise<EmailActionBindingDto | null>;
  deleteEmailActionBinding(id: string): Promise<boolean>;
```

- [x] **Step 2: Adapter umstellen + neue Funktionen**

In `postgres-content-email.ts`: `EmailTemplateSqlRow` + Mapper auf `blocks jsonb`/`required_variables jsonb` umstellen; alle SELECT/INSERT/UPDATE-Spaltenlisten von den fünf Feldern auf `blocks, required_variables` ändern. Neue Funktionen (mirror the file's `export async function`-Muster, `nanoid()` für Text-PKs wie in `postgres-developer.ts`):

```typescript
export async function getEmailBranding(pool: Pool): Promise<EmailBrandingDto> {
  const r = await pool.query(
    `SELECT header_asset_id, footer_asset_id, footer_text FROM email_branding ORDER BY id ASC LIMIT 1`,
  );
  const row = r.rows[0] ?? { header_asset_id: null, footer_asset_id: null, footer_text: null };
  return { headerAssetId: row.header_asset_id, footerAssetId: row.footer_asset_id, footerText: row.footer_text };
}

export async function updateEmailBranding(pool: Pool, data: Partial<EmailBrandingDto>): Promise<EmailBrandingDto> {
  await pool.query(
    `UPDATE email_branding SET
       header_asset_id = COALESCE($1, header_asset_id),
       footer_asset_id = COALESCE($2, footer_asset_id),
       footer_text = COALESCE($3, footer_text),
       updated_at = NOW()
     WHERE id = (SELECT id FROM email_branding ORDER BY id ASC LIMIT 1)`,
    [data.headerAssetId ?? null, data.footerAssetId ?? null, data.footerText ?? null],
  );
  return getEmailBranding(pool);
}

export async function insertEmailAsset(pool: Pool, data: { mimeType: string; bytes: Buffer }): Promise<EmailAssetDto> {
  const id = nanoid();
  const r = await pool.query(
    `INSERT INTO email_assets (id, mime_type, bytes, created_at) VALUES ($1, $2, $3, NOW())
     RETURNING id, mime_type, created_at`,
    [id, data.mimeType, data.bytes],
  );
  return { id: r.rows[0].id, mimeType: r.rows[0].mime_type, createdAt: r.rows[0].created_at };
}

export async function getEmailAssetBytes(pool: Pool, id: string): Promise<{ mimeType: string; bytes: Buffer } | null> {
  const r = await pool.query(`SELECT mime_type, bytes FROM email_assets WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  return { mimeType: r.rows[0].mime_type, bytes: r.rows[0].bytes };
}

export async function listEmailActionBindings(pool: Pool, actionKey?: string): Promise<EmailActionBindingDto[]> {
  const r = actionKey
    ? await pool.query(
        `SELECT id, action_key, template_id, enabled FROM email_action_bindings WHERE action_key = $1 ORDER BY created_at ASC`,
        [actionKey],
      )
    : await pool.query(`SELECT id, action_key, template_id, enabled FROM email_action_bindings ORDER BY created_at ASC`);
  return r.rows.map((x) => ({ id: x.id, actionKey: x.action_key, templateId: x.template_id, enabled: x.enabled }));
}

export async function createEmailActionBinding(
  pool: Pool,
  data: { actionKey: string; templateId: number },
): Promise<EmailActionBindingDto> {
  const id = nanoid();
  const r = await pool.query(
    `INSERT INTO email_action_bindings (id, action_key, template_id, enabled, created_at)
     VALUES ($1, $2, $3, true, NOW())
     ON CONFLICT (action_key, template_id) DO UPDATE SET enabled = true
     RETURNING id, action_key, template_id, enabled`,
    [id, data.actionKey, data.templateId],
  );
  return { id: r.rows[0].id, actionKey: r.rows[0].action_key, templateId: r.rows[0].template_id, enabled: r.rows[0].enabled };
}

export async function setEmailActionBindingEnabled(
  pool: Pool,
  id: string,
  enabled: boolean,
): Promise<EmailActionBindingDto | null> {
  const r = await pool.query(
    `UPDATE email_action_bindings SET enabled = $1 WHERE id = $2 RETURNING id, action_key, template_id, enabled`,
    [enabled, id],
  );
  if (r.rows.length === 0) return null;
  return { id: r.rows[0].id, actionKey: r.rows[0].action_key, templateId: r.rows[0].template_id, enabled: r.rows[0].enabled };
}

export async function deleteEmailActionBinding(pool: Pool, id: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM email_action_bindings WHERE id = $1 RETURNING id`, [id]);
  return (r.rowCount ?? 0) > 0;
}
```

`nanoid` importieren (`import { nanoid } from "nanoid";`).

- [x] **Step 3: In `PostgresAdapter` delegieren**

In `postgres.ts` die neuen Funktionen aus `postgres-content-email.js` aliased importieren (Muster wie die bestehenden Email-Template-Importe) und im Class-Body je eine One-Line-Delegation ergänzen (analog zu MC-077 Task 2 Step 3). Der bestehende `implements AdminRepository` deckt die neuen Methoden über das erweiterte Interface ab.

- [x] **Step 4: Service-Layer anpassen**

In `apps/backend/src/services/email-templates.ts`: `EmailTemplate`-Interface (`:4-16`) auf `blocks`/`requiredVariables` umstellen, `rowToEmailTemplate` entsprechend. Neue dünne Service-Wrapper für Branding/Assets/Bindings (Muster: bestehende `getManagedEmailTemplates` etc.).

- [x] **Step 5: Typecheck**

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: Fehler NUR noch in Routen/Renderer (Task 6–8), nicht im db-/service-Layer. (Renderer/Routen referenzieren noch alte Felder — in den Folge-Tasks behoben.)

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/db/admin-repository.ts apps/backend/src/db/adapters/postgres-content-email.ts apps/backend/src/db/adapters/postgres.ts apps/backend/src/services/email-templates.ts
git commit -m "Feat: repository + adapter for block templates, branding, assets, bindings (MC-078)"
```

---

## Task 6: Renderer — Blöcke + globales Branding + Button

**Files:**
- Modify: `apps/backend/src/services/email-renderer.ts`
- Test: `apps/backend/src/services/__tests__/email-renderer.test.ts`

- [x] **Step 1: Failing test schreiben**

Create `apps/backend/src/services/__tests__/email-renderer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { EmailBlockType } from "@musiccloud/shared";
import { renderBlocks } from "../email-renderer.js";

const branding = { headerAssetId: null, footerAssetId: null, footerText: "share it everywhere" };
const baseUrl = "http://localhost:4000";

describe("renderBlocks", () => {
  it("interpolates variables in text and button blocks", () => {
    const html = renderBlocks(
      [
        { type: EmailBlockType.Text, markdown: "Hello {{username}}" },
        { type: EmailBlockType.Button, label: "Activate", url: "{{inviteUrl}}" },
      ],
      branding,
      { username: "Alice", inviteUrl: "https://x/y" },
      baseUrl,
    );
    expect(html).toContain("Alice");
    expect(html).toContain("https://x/y");
    expect(html).toContain("Activate");
  });

  it("renders the global footer text once", () => {
    const html = renderBlocks([{ type: EmailBlockType.Text, markdown: "Body" }], branding, {}, baseUrl);
    expect(html).toContain("share it everywhere");
  });

  it("points an image block at the asset route", () => {
    const html = renderBlocks(
      [{ type: EmailBlockType.Image, assetId: "abc", altText: "banner" }],
      branding,
      {},
      baseUrl,
    );
    expect(html).toContain("/api/admin/email-assets/abc");
    expect(html).toContain('alt="banner"');
  });
});
```

- [x] **Step 2: Test läuft rot**

Run: `pnpm --filter @musiccloud/backend test:run -- email-renderer`
Expected: FAIL (`renderBlocks` existiert nicht).

- [x] **Step 3: Renderer umbauen**

In `email-renderer.ts`: `EmailTemplateFields`-Interface + `buildRows` durch eine block-basierte `renderBlocks` ersetzen. `interpolate`/`parseMarkdown`/`applyInlineStyles`/`buildEmailHtml`/`DARK_RULES`/`DARK_MODE_CSS` bleiben. Der Button-Block übernimmt das dark-mode-sichere Tabellen-Button-HTML aus `developer-email.ts:48-54` (Akzent `#28A8D8`, `border-radius:8px`, `color:#0f1115`). Bild-Block: `<img src="${baseUrl}/api/admin/email-assets/${assetId}" alt="${escapeHtml(altText)}" ...>`. Branding-Header-Asset (falls gesetzt) als erste Zeile, Footer-Asset + Footer-Text als letzte.

```typescript
import { type EmailBlock, EmailBlockType } from "@musiccloud/shared";
import type { EmailBrandingDto } from "../db/admin-repository.js";

const BUTTON_ACCENT = "#28A8D8";

function renderButton(label: string, url: string): string {
  return `<tr><td style="padding:8px 40px 24px;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:${BUTTON_ACCENT};"><a href="${url}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#0f1115;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table></td></tr>`;
}

function assetUrl(assetId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/admin/email-assets/${assetId}`;
}

/**
 * Renders a template's body blocks into the shared HTML shell, wrapped by the
 * global branding (header/footer asset + footer text). Text and button blocks
 * interpolate `{{var}}` from `variables`; the caller is responsible for having
 * validated required variables.
 */
export function renderBlocks(
  blocks: EmailBlock[],
  branding: EmailBrandingDto,
  variables: Record<string, string>,
  baseUrl: string,
): string {
  const rows: string[] = [];
  if (branding.headerAssetId) {
    rows.push(
      `<tr><td><img src="${assetUrl(branding.headerAssetId, baseUrl)}" width="560" alt="" style="display:block;width:100%;border-radius:8px 8px 0 0;"></td></tr>`,
    );
  }
  for (const block of blocks) {
    switch (block.type) {
      case EmailBlockType.Text:
        rows.push(`<tr><td style="padding:24px 40px;">${parseMarkdown(interpolate(block.markdown, variables))}</td></tr>`);
        break;
      case EmailBlockType.Button:
        rows.push(renderButton(block.label, interpolate(block.url, variables)));
        break;
      case EmailBlockType.Image:
        rows.push(
          `<tr><td style="padding:0 40px;"><img src="${assetUrl(block.assetId, baseUrl)}" width="480" alt="${escapeHtml(block.altText)}" style="display:block;max-width:100%;"></td></tr>`,
        );
        break;
      case EmailBlockType.Divider:
        rows.push(`<tr><td style="padding:8px 40px;"><hr style="border:none;border-top:1px solid #E5E5EA;"></td></tr>`);
        break;
      case EmailBlockType.Spacer:
        rows.push(`<tr><td style="height:${Math.max(0, Math.round(block.heightPx))}px;line-height:0;">&nbsp;</td></tr>`);
        break;
    }
  }
  if (branding.footerText) {
    rows.push(
      `<tr><td class="em-footer-border" style="padding:24px 40px;border-top:1px solid #E5E5EA;text-align:center;"><div class="em-footer-text" style="font-size:13px;color:#8E8E93;line-height:1.5;">${parseMarkdown(interpolate(branding.footerText, variables))}</div></td></tr>`,
    );
  }
  if (branding.footerAssetId) {
    rows.push(
      `<tr><td><img src="${assetUrl(branding.footerAssetId, baseUrl)}" width="560" alt="" style="display:block;width:100%;border-radius:0 0 8px 8px;"></td></tr>`,
    );
  }
  return buildEmailHtml(rows, DARK_MODE_CSS);
}
```

`renderEmailTemplate` und `renderEmailPreview` auf `renderBlocks` umstellen: `renderEmailTemplate(template: { subject: string; blocks: EmailBlock[] }, branding, variables, baseUrl)` gibt `{ html: renderBlocks(...), subject: interpolate(template.subject, variables) }`. `renderEmailPreview(blocks, branding, colorScheme, baseUrl)` nutzt `renderBlocks(blocks, branding, {}, baseUrl)` mit `colorScheme === "dark" ? DARK_RULES`-Variante (Signatur von `buildEmailHtml` beibehalten). `resolveAssetUrl` entfällt (Assets kommen jetzt über die Asset-Route).

- [x] **Step 4: Test grün**

Run: `pnpm --filter @musiccloud/backend test:run -- email-renderer`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/services/email-renderer.ts apps/backend/src/services/__tests__/email-renderer.test.ts
git commit -m "Feat: block-based email renderer with global branding + button block (MC-078)"
```

---

## Task 7: Trigger-Service + Variablen-Validierung

**Files:**
- Create: `apps/backend/src/services/email-actions.ts`
- Modify: `apps/backend/src/services/email-sender.ts`
- Test: `apps/backend/src/services/__tests__/email-actions.test.ts`

- [x] **Step 1: Failing test schreiben**

Create `apps/backend/src/services/__tests__/email-actions.test.ts` mit gemocktem Repository (`getAdminRepository`) + gemocktem `sendEmail`. Fälle:
- `triggerEmailAction(AdminInviteSent, {to, variables})` mit einem aktivierten Binding → `sendEmail` genau 1×; mit zwei Bindings → 2×.
- required Action ohne aktiviertes Binding → wirft `Error` (kein stiller No-Op).
- Template deklariert `requiredVariables: [{name:"missing"}]`, Action liefert diese nicht → wirft (Kompatibilitäts-/Send-Check).

(Vollständiger Testcode analog zu `developer-auth.test.ts` mocking-Stil: `vi.mock("../db/index.js", …)`, `vi.mock("./email-provider.js", …)`.)

- [x] **Step 2: Test läuft rot**

Run: `pnpm --filter @musiccloud/backend test:run -- email-actions`
Expected: FAIL.

- [x] **Step 3: Trigger-Service schreiben**

Create `apps/backend/src/services/email-actions.ts`:

```typescript
/**
 * @file System-Action-Trigger (MC-078). `triggerEmailAction` fächert ein
 * code-definiertes Ereignis (siehe `@musiccloud/shared` EMAIL_ACTIONS) an
 * alle aktivierten, gebundenen Templates auf: jedes wird gerendert und
 * gesendet. Ersetzt die festverdrahteten Direkt-Aufrufe (`sendTemplatedEmail`
 * mit fester templateId).
 */
import { getEmailActionMeta } from "@musiccloud/shared";
import { getAdminRepository } from "../db/index.js";
import { requireEnv } from "../lib/env.js";
import { renderEmailTemplate } from "./email-renderer.js";
import { sendEmail } from "./email-provider.js";

/**
 * Renders and sends every enabled template bound to `actionKey`.
 *
 * @param actionKey - a key from EMAIL_ACTIONS.
 * @param input - recipient + the variables this action provides.
 * @throws when the action is unknown; when a `required` action has no enabled
 *   binding; or when a bound template declares a required variable the action
 *   did not supply.
 */
export async function triggerEmailAction(
  actionKey: string,
  input: { to: { email: string; name?: string }; variables: Record<string, string> },
): Promise<void> {
  const meta = getEmailActionMeta(actionKey);
  if (!meta) throw new Error(`Unknown email action: ${actionKey}`);

  const repo = await getAdminRepository();
  const bindings = (await repo.listEmailActionBindings(actionKey)).filter((b) => b.enabled);

  if (meta.required && bindings.length === 0) {
    throw new Error(`Required email action "${actionKey}" has no enabled template binding`);
  }

  const branding = await repo.getEmailBranding();
  const baseUrl = requireEnv("PUBLIC_URL");

  for (const binding of bindings) {
    const tpl = await repo.getEmailTemplateById(binding.templateId);
    if (!tpl) continue;
    for (const rv of tpl.requiredVariables) {
      if (!(rv.name in input.variables)) {
        throw new Error(`Template "${tpl.name}" requires variable "${rv.name}" not supplied by action "${actionKey}"`);
      }
    }
    const { html, subject } = renderEmailTemplate(
      { subject: tpl.subject, blocks: tpl.blocks },
      branding,
      input.variables,
      baseUrl,
    );
    await sendEmail({ to: input.to, subject, html });
  }
}
```

`sendTemplatedEmail` in `email-sender.ts` auf den neuen Renderer + Branding umstellen (wird noch vom Test-Send-Button in Task 8 gebraucht): lädt Branding, ruft `renderEmailTemplate({subject, blocks}, branding, variables, PUBLIC_URL)`.

- [x] **Step 4: Test grün**

Run: `pnpm --filter @musiccloud/backend test:run -- email-actions`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/services/email-actions.ts apps/backend/src/services/email-sender.ts apps/backend/src/services/__tests__/email-actions.test.ts
git commit -m "Feat: triggerEmailAction fan-out + variable validation (MC-078)"
```

---

## Task 8: Endpoints + Backend-Routen (Assets, Branding, Actions, Templates, Preview)

**Files:**
- Modify: `packages/shared/src/endpoints.ts` (`admin`-Gruppe, `ROUTE_TEMPLATES.admin`)
- Create: `apps/backend/src/routes/admin-email-assets.ts`
- Create: `apps/backend/src/routes/admin-email-branding.ts`
- Create: `apps/backend/src/routes/admin-email-actions.ts`
- Modify: `apps/backend/src/routes/admin-email-templates.ts`
- Modify: `apps/backend/src/routes/admin-users.ts` (Invite → Trigger)
- Modify: `apps/backend/src/server.ts` (Routen registrieren)

- [x] **Step 1: Endpoints ergänzen**

In `packages/shared/src/endpoints.ts` `admin`-Gruppe (nach `emailTemplates`, `:272`):

```typescript
    emailAssets: {
      /** POST: upload an image (multipart), returns { id }. */
      upload: "/api/admin/email-assets",
      /** GET: serve an asset's bytes by id. */
      detail: (id: string) => `/api/admin/email-assets/${id}`,
    },
    emailBranding: {
      /** GET: read / PUT: update the global branding singleton. */
      base: "/api/admin/email-branding",
    },
    emailActions: {
      /** GET: list all code-defined actions + their bindings. */
      list: "/api/admin/email-actions",
      /** POST: bind a template to an action. Body: { actionKey, templateId }. */
      bindings: "/api/admin/email-actions/bindings",
      /** PATCH: toggle / DELETE: remove a binding by id. */
      binding: (id: string) => `/api/admin/email-actions/bindings/${id}`,
    },
```

In `ROUTE_TEMPLATES.admin` (`:454-457`) ergänzen: `emailAssets: { detail: "/api/admin/email-assets/:id" }`, `emailActions: { binding: "/api/admin/email-actions/bindings/:id" }`.

- [x] **Step 2: Asset-Route (Upload + Serve) — auf zwei Files gesplittet**

**Drift/Korrektur beim Execute:** Der Plan-Text sah EIN File `admin-email-assets.ts` für Upload+Serve vor. Das Repo hat aber eine etablierte Konvention: eine Route-Datei wird in `server.ts` immer nur in EINEM Scope registriert (`admin-*.ts` → `adminRoutes`-Block mit `authenticateAdmin`-preHandler; Files ohne `admin-`-Prefix, z.B. `genre-artwork.ts` → Root-Scope, kein Auth-Wrapper). Da Fastifys preHandler für alle Routen EINER Datei gilt, können Upload (muss admin-only bleiben) und Serve (muss public sein, Mail-Clients haben kein Admin-JWT) nicht in derselben Datei liegen, wenn diese Datei nur in einem Scope registriert wird. Deshalb zwei Files:

- **`apps/backend/src/routes/admin-email-assets.ts`** (NEU, kein Plan-Name-Konflikt): nur die admin-guarded `POST`. Akzeptiert `data:`-URL-Body (mirror admin-users avatar-upload: `{ dataUrl }`, base64 dekodieren, ≤5 MB, MIME-Whitelist JPEG/PNG/WebP wie beim Avatar-Upload — gleiches SVG-XSS-Risiko), `createManagedEmailAsset({mimeType, bytes})`, `201 { id }`. Registriert im `adminRoutes`-Block.
- **`apps/backend/src/routes/email-assets.ts`** (NEU, kein `admin-`-Prefix, öffentlicher Serve-Endpoint): nur `GET :id` (mirror `genre-artwork.ts`), `getManagedEmailAssetBytes(id)` → `reply.code(200).header("Content-Type", mimeType).header("Cache-Control", "public, max-age=31536000, immutable").send(bytes)`, sonst `404`. Registriert an Fastifys ROOT-Scope (mirror exakt `genreArtworkRoutes`), OHNE `authenticateAdmin`.

URL-Pfad bleibt für beide bei `/api/admin/email-assets/...` (nur String, keine Auth-Grenze) — die Serve-Route liegt trotzdem im PUBLIC-Scope, weil die Fastify-Registrierung (nicht der Pfad-String) die tatsächliche Auth-Grenze zieht.

> **Hinweis (erledigt):** Same-origin zum Backend, kein `PUBLIC_URL`-Cross-App-Abgleich — behebt die Broken-Image-Bug-Klasse strukturell. Entscheidung: public Serve-Route (Bilder sind öffentlich referenzierbar in versendeten Mails, nicht geheim), Upload bleibt admin-guarded. Umgesetzt wie oben beschrieben, verifiziert per Trace der tatsächlichen `server.ts`-Registrierungsreihenfolge (Serve vor dem `adminRoutes`-Block registriert, Upload danach innerhalb) + grünem Backend-Testlauf (der die volle Route-Registrierung via `buildApp()` exercised).

- [x] **Step 3: Branding-Route**

Create `apps/backend/src/routes/admin-email-branding.ts`: `GET base` → `getManagedEmailBranding()`; `PUT base` (Body `{ headerAssetId?, footerAssetId?, footerText? }`, validiert per manuellem `typeof`-Check wie `admin-email-templates.ts`) → `updateManagedEmailBranding(...)`.

> **Behoben (Task-5-Adapter-Fix, ausserhalb von Task 8 committet):** `updateEmailBranding`'s SQL nutzte ursprünglich `COALESCE($1, header_asset_id)`, was ein explizites `null` im PUT-Body identisch zu "Feld weggelassen" behandelte und NICHT clearte. Der Adapter (`postgres-content-email.ts`) wurde auf ein present-keys-only dynamisches SET-Pattern umgestellt (Muster: `updateEmailTemplate` in derselben Datei) — ein explizites `null` cleared das Feld jetzt korrekt, ein weggelassenes Feld bleibt unverändert. Empirisch gegen die lokale DB verifiziert (Commit `04b97a60`).

- [x] **Step 4: Actions-Route**

Create `apps/backend/src/routes/admin-email-actions.ts`: `GET list` → alle `EMAIL_ACTIONS` (aus shared) angereichert mit ihren `listManagedEmailActionBindings(key)`. `POST bindings` (Body `{actionKey, templateId}`): validiert dass `actionKey` in `EMAIL_ACTIONS` existiert (via `getEmailActionMeta`) UND dass das Template kompatibel ist (jede `template.requiredVariables[].name` ∈ `action.variables`) → sonst `400` mit konkretem Variablennamen; sonst `createManagedEmailActionBinding`. `PATCH binding(:id)` (`{enabled}`) → `setManagedEmailActionBindingEnabled`. `DELETE binding(:id)` → `deleteManagedEmailActionBinding`.

- [x] **Step 5: Template-Routen auf Blöcke umstellen**

In `admin-email-templates.ts`: `validateCreateBody`/`validateUpdateBody`/`validateImportBody`/`validatePreviewBody` auf `blocks` (via `isEmailBlockArray` aus shared) + `requiredVariables` umgestellt, die fünf Feld-Validierungen entfernt. `preview`-Endpoint: Body `{ blocks, colorScheme }`, lädt Branding via `getManagedEmailBranding()`, ruft `renderEmailPreview(blocks, branding, colorScheme, requireEnv("PUBLIC_URL"))` (neue Argumentreihenfolge aus Task 6). Export/Import-JSON-Shape trägt jetzt automatisch `blocks`/`requiredVariables` (destructured aus dem `EmailTemplate`-Objekt, das seit Task 5 diese Felder hat). Test-Send (`:234-269`) unverändert, nutzt weiterhin `sendTemplatedEmail` (bereits in Task 7 auf Blöcke umgestellt), Variablen-Map unverändert. Keine bestehende `admin-email-templates.test.ts` gefunden — kein Test-Update nötig.

- [x] **Step 6: Invite-Flow auf Trigger umstellen**

In `admin-users.ts`: `sendTemplatedEmail({templateId: body.welcomeTemplateId, …})` ersetzt durch `triggerEmailAction(EmailAction.AdminInviteSent, {...})` mit allen 5 von der Action verlangten Variablen (`username`, `email`, `role`, `inviteUrl`, `loginUrl`). `welcomeTemplateId` komplett aus Request-Body-Typ + Validierung entfernt (Backend-seitig verifiziert: 0 Treffer für `grep welcomeTemplateId apps/backend/src`). Der try/catch-Wrapper (Mail-Fail rollt User-Anlage nicht zurück) bleibt erhalten, Kommentar ergänzt um die neuen Throw-Gründe (kein Binding, inkompatible Variable).

- [x] **Step 7: Routen registrieren**

In `server.ts`: `emailAssetServeRoutes` (public Serve) an Root-Scope registriert, direkt nach `genreArtworkRoutes` (Zeile 631, vor dem `adminRoutes`-Block). `adminEmailActionsRoutes`/`adminEmailAssetsRoutes`/`adminEmailBrandingRoutes` im `adminRoutes`-Block registriert (Zeilen 669-671, nach dem `authenticateAdmin`-preHandler-Hook), alphabetisch neben `adminEmailTemplateRoutes` einsortiert.

- [x] **Step 8: Typecheck + Backend-Tests + Lint**

Run: `pnpm --filter @musiccloud/backend typecheck && pnpm --filter @musiccloud/backend test:run && pnpm lint`
Ergebnis: alle drei grün. Typecheck 0 Fehler (erster fehlerfreier Lauf seit Task 4). Tests: 87 Files, 1203 Tests grün, 35 skipped (unverändert). Lint: 1 Formatierungsfehler in `admin-email-actions.ts` (zu lange Import-Zeile) gefunden und sofort per `biome check --write` behoben, danach clean.

- [x] **Step 9: Commit**

```bash
git add packages/shared/src/endpoints.ts apps/backend/src/routes/email-assets.ts apps/backend/src/routes/admin-email-assets.ts apps/backend/src/routes/admin-email-branding.ts apps/backend/src/routes/admin-email-actions.ts apps/backend/src/routes/admin-email-templates.ts apps/backend/src/routes/admin-users.ts apps/backend/src/server.ts
git commit -m "Feat: email asset/branding/action routes + invite via triggerEmailAction (MC-078)"
```

Commit: `047b5beb`, 8 Files geändert (425 Insertions, 83 Deletions).

---

## Task 9: Dashboard — Contracts + Hooks

**Files:**
- Modify: `apps/dashboard/src/shared/contracts/admin-email-templates.ts`
- Modify: `apps/dashboard/src/features/templates/hooks/useEmailTemplates.ts`
- Create: `apps/dashboard/src/features/templates/hooks/useEmailBranding.ts`
- Create: `apps/dashboard/src/features/templates/hooks/useEmailActions.ts`

- [x] **Step 1: Contract auf Blöcke umstellen**

`admin-email-templates.ts`: `EmailTemplate` von den fünf Feldern auf `blocks: EmailBlock[]` + `requiredVariables: {name;description}[]` umstellen (import `EmailBlock` aus `@musiccloud/shared`).

- [x] **Step 2: Hooks ergänzen**

`useEmailTemplates.ts`: `EmailTemplateInput` bleibt `Omit<...>`, Shape folgt dem Contract. Neue Files `useEmailBranding.ts` (`useEmailBranding` GET, `useUpdateEmailBranding` PUT gegen `ENDPOINTS.admin.emailBranding.base`) und `useEmailActions.ts` (`useEmailActions` GET `list`, `useCreateBinding`/`useToggleBinding`/`useDeleteBinding` gegen `emailActions.*`), Muster wie die bestehenden TanStack-Hooks.

> Umsetzungshinweis: `useEmailTemplates.ts`'s bisherige lokale `EmailTemplateInput = Omit<EmailTemplate, ...>`-Redeklaration war byte-identisch zur Contract-Definition (DRY-Verstoss) — durch Re-Import + Re-Export des Contract-Typs ersetzt, Konsumenten-Imports (`EmailTemplateEditPage.tsx`, `EmailTemplateListPage.tsx`) unverändert funktionsfähig, da sie weiterhin aus dem Hook-File importieren.
>
> Doctor-Gate: `useEmailBranding.ts`/`useEmailActions.ts` haben in diesem Task noch keine Importer (Consumer folgen in Task 11/12) — React Doctor's `deslop/unused-file` blockierte den Pre-Commit-Hook. Gelöst nach demselben Präzedenzfall wie Commit `46c70d66` (resolveMode.ts-Store ohne Task-1-Konsument): scoped, kommentierte Suppression in `doctor.config.ts` (`ignore.files`), mit Verweis auf Task 9 (Ersteller) und Task 11/12 (Konsumenten), Entfernungshinweis inklusive.

- [x] **Step 3: Typecheck**

Run: `pnpm --filter @musiccloud/dashboard typecheck` (falls Script existiert; sonst `pnpm --filter @musiccloud/dashboard build`)
Expected: Fehler nur noch in den UI-Files (Task 10–12).

> Ergebnis: 12 Fehler, alle in `Sidebar.tsx` (Duplicate-Template-Button, Zeilen 476-480) und `EmailTemplateEditPage.tsx` (Zeilen 133-145) — beides Konsumenten der alten 5-Feld-Form, ausserhalb dieses Tasks' File-Liste. Null Fehler in `shared/contracts/` und `features/templates/hooks/`.

- [x] **Step 4: Commit**

```bash
git add apps/dashboard/src/shared/contracts/admin-email-templates.ts apps/dashboard/src/features/templates/hooks
git commit -m "Feat: dashboard contracts + hooks for blocks/branding/actions (MC-078)"
```

> Commit `8b561a10`. Zusätzlich `doctor.config.ts` mitgestaged (Pre-Commit-Gate-Fix, siehe Step 2).

---

## Task 10: Dashboard — Block-Editor

**Files:**
- Create: `apps/dashboard/src/features/templates/email-templates/BlockEditor.tsx`
- Create: `apps/dashboard/src/features/templates/email-templates/blockDefaults.ts`
- Modify: `apps/dashboard/src/features/templates/email-templates/EmailTemplateEditPage.tsx`
- Modify: `apps/dashboard/src/features/templates/email-templates/EmailPreview.tsx`

- [x] **Step 1: Block-Defaults + Editor-Komponente**

`blockDefaults.ts`: Factory pro `EmailBlockType` (leerer Text-Block, Button mit leerem Label/URL, etc.). `BlockEditor.tsx`: sortierbare Liste (dnd-kit, Muster aus `NavManagerPage.tsx` — `DndContext`/`SortableContext`/`useSortable`/`arrayMove`/`PointerSensor`+`KeyboardSensor`/`handleDragEnd`), pro Block ein Typ-spezifisches Formular (Text→`MarkdownEditor`, Button→2 Inputs, Bild→Asset-Upload/-Referenz + Alt-Text, Divider/Spacer→minimal), „+ Block hinzufügen"-Menü, Entfernen pro Karte. Props: `blocks`, `onChange(blocks)`.

> Umsetzungshinweis: „+ Block hinzufügen" als fünf `DashboardActionButton`s (einer pro Typ) statt eines Dropdown-Menüs umgesetzt (KISS — kein generisches Dropdown-Menü existiert in `@musiccloud/dashboard-ui` für 5 fixe Optionen, `ListboxPopover` ist für ein anderes Pattern gebaut). Zwei zusätzliche, vom Dispatcher vorautorisierte Files erstellt: `apps/dashboard/src/features/templates/hooks/useEmailAssets.ts` (`useUploadEmailAsset()`-Mutation gegen `ENDPOINTS.admin.emailAssets.upload`, Muster aus `useEmailBranding.ts`/`useEmailActions.ts`) und `apps/dashboard/src/lib/files.ts` (extrahiert `fileToDataUrl` aus `useAdminUsers.ts:64-71`, DRY — beide Upload-Flows teilen sich jetzt eine Implementierung; `useAdminUsers.ts` importiert von dort). Icons verifiziert gegen die installierte `@phosphor-icons/react@2.1.10`-Bundle-Typdefinition vor Verwendung (`TextTIcon`, `CursorClickIcon`, `ImageIcon`, `MinusIcon`, `TrayArrowUpIcon`, plus die bereits etablierten `ListIcon`/`XCircleIcon`/`PlusCircle`-Familie aus `NavManagerPage.tsx`/`actionCatalog.tsx`).

- [x] **Step 2: Edit-Page umbauen**

`EmailTemplateEditPage.tsx`: `TemplateFormFields` von den fünf Feldern auf `{ name, subject, blocks, requiredVariables }` umstellen. `EmailTemplateEditorGrid` links `BlockEditor` statt der drei `EmailTemplateMarkdownSection`, plus ein kleiner Editor für `requiredVariables` (Liste von name/description). `buildPayload` liefert `{name, subject, blocks, requiredVariables}`.

> Umsetzungshinweis: `RequiredVariablesEditor` als lokale Komponente in derselben Datei (kurz genug, kein eigenes File nötig). React-Doctor (`no-array-index-key`/`no-array-index-as-key`) flaggte den anfänglichen `key={index}` auf den Variable-Rows als echtes Bug-Risiko (Remove-in-der-Mitte kann DOM-State fehlzuordnen) — behoben mit einem lokalen monotonen Row-Key-Counter (`nextRowKeyRef`) statt Array-Index, PLUS `key={numId}` auf `EmailTemplateEditorGrid`, damit ein In-Place-Templatewechsel (Route-Param ändert sich, Seite bleibt gemountet — React Router remountet bei reinem `:id`-Wechsel nicht) den lokalen Row-Key-State sauber zurücksetzt statt stale Keys vom vorigen Template zu behalten. `doctor:diff` danach 0 Findings. Alte, jetzt tote `EmailTemplateMarkdownSection`/`MarkdownEditorField`-Helper + ihre Imports (`Suspense`, `lazy`, `MarkdownEditor`, `SealWarningIcon`, `EnvelopeOpenIcon`, `SquareHalfBottomIcon`) vollständig entfernt (keine externen Referenzen, per Grep verifiziert). `EmailTemplateVariable`-Typ direkt aus `@/shared/contracts/admin-email-templates` importiert (nicht über `useEmailTemplates.ts` re-exportiert, da dort nicht vorhanden — Typecheck deckte das sofort auf).
>
> **`Sidebar.tsx`-Frage geklärt:** Task 9 hatte 6 Typecheck-Fehler in `Sidebar.tsx:476-480` (der „Duplicate template"-Button spreadet die 5 alten Flat-Fields in `createTemplate.mutateAsync`) als „nicht Teil dieses Tasks' File-Liste" vermerkt. Dieser Task hat `EmailTemplateInput` genau auf `blocks`/`requiredVariables` umgestellt — die 6 Fehler sind eine direkte, mechanische Konsequenz derselben Shape-Änderung (identisch zum Rest dieses Tasks: „alte Feld-Referenzen aufräumen"), keine neue Feature-Anforderung. Gefixt: die 5 alten Felder durch `blocks: tpl.blocks, requiredVariables: tpl.requiredVariables` ersetzt. `Sidebar.tsx` ist daher Teil dieses Commits, obwohl nicht im Plan-Task-10-File-Header gelistet.

- [x] **Step 3: Preview umbauen**

`EmailPreview.tsx`: Props `{ blocks }` statt der fünf Felder; POST an `preview` mit `{ blocks, colorScheme }`.

- [x] **Step 4: Build/Typecheck**

Run: `pnpm --filter @musiccloud/dashboard build`
Expected: kompiliert. Manueller Smoke folgt in Task 13.

> Ergebnis: `pnpm --filter @musiccloud/dashboard typecheck` → 0 Fehler (alle 12 Fehler aus Task 9 — 6× `EmailTemplateEditPage.tsx`, 6× `Sidebar.tsx` — behoben). `pnpm --filter @musiccloud/dashboard build` → kompiliert sauber. `pnpm lint` (repo-weit, Biome) → clean nach `biome check --write` auf zwei Formatierungs-/Import-Sortierungs-Findings in `BlockEditor.tsx`/`EmailTemplateEditPage.tsx`. `pnpm doctor:diff` → 0 Findings (siehe Step-2-Notiz zur Row-Key-Behebung in `EmailTemplateEditPage.tsx`). Beim `git commit` fing der Pre-Commit-Hook (Full-Scan via `pnpm run doctor`, nicht Diff-Scan) danach zusätzlich denselben `no-array-index-key`/`no-array-index-as-key`-Befund in `BlockEditor.tsx:136` (`SortableBlockCard`s `key={index}`) — vom vorherigen `doctor:diff`-Lauf nicht gemeldet (Root Cause nicht ermittelt, keine Vermutung dazu). Behoben nach demselben Muster wie `RequiredVariablesEditor`: dnd-kits sortable `id` bleibt Index-basiert (Pflicht für `arrayMove`/`handleDragEnd`), der React-`key` läuft über einen separaten, monoton hochzählenden `cardKeys`-State (add/remove/reorder pflegen ihn synchron mit `blocks`). `pnpm run doctor` (voller Repo-Scan, identisch zum Pre-Commit-Hook) danach 0 Findings über alle 4 gescannten Projekte.

- [x] **Step 5: Commit**

```bash
git add apps/dashboard/src/features/templates/email-templates
git commit -m "Feat: block-based email template editor (MC-078)"
```

> Umgesetzt als: `apps/dashboard/src/features/templates/email-templates/BlockEditor.tsx`, `blockDefaults.ts`, `EmailTemplateEditPage.tsx`, `EmailPreview.tsx`, plus `apps/dashboard/src/features/templates/hooks/useEmailAssets.ts`, `apps/dashboard/src/lib/files.ts`, `apps/dashboard/src/features/system/hooks/useAdminUsers.ts` (Extraktions-Update), `apps/dashboard/src/i18n/messages.ts` (neue/entfernte Keys), `apps/dashboard/src/components/layout/Sidebar.tsx` (Duplicate-Button-Fix, siehe Step-2-Notiz).

---

## Task 11: Dashboard — Branding-Seite

**Files:**
- Create: `apps/dashboard/src/features/templates/email-templates/EmailBrandingPage.tsx`
- Modify: `apps/dashboard/src/routes.tsx` (Route `email-branding`)
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx` (Eintrag unter „Templates" oder „System")

- [x] **Step 1: Branding-Seite bauen**

`EmailBrandingPage.tsx`: lädt `useEmailBranding`, zeigt Header-Asset (Upload/Vorschau), Footer-Asset (Upload/Vorschau), Footer-Text (Markdown), speichert per `useUpdateEmailBranding`. Asset-Upload: File→`data:`-URL→`POST emailAssets.upload`→`{id}`→als `headerAssetId`/`footerAssetId` speichern.

> Umsetzungshinweis: `routeComponents.tsx` war im Plan-File-Header nicht gelistet, aber Pflicht — `routes.tsx` importiert Seiten-Komponenten ausschliesslich über den `lazy()`-Re-Export aus `routeComponents.tsx` (Muster identisch zu `EmailTemplateEditPage`), nie direkt. `EmailBrandingPage`-Export dort direkt nach `EmailTemplateEditPage` ergänzt. Layout-Entscheidung: `PageHeader` + `SaveActionButton` im Header (Muster `NavManagerPage.tsx`/`EmailTemplateEditPage.tsx`, nicht `DesignSettingsPage.tsx`s Inline-Heading), da diese Seite im selben Feature-Ordner wie `EmailTemplateEditPage.tsx` lebt und dieselbe „mehrere Felder, ein Save"-Form hat. Draft-State: lokales `{headerAssetId, footerAssetId, footerText}`-Objekt, geseedet per ref-guarded Sync (`syncedRef`), identisch zum Idiom in `EmailTemplateEditPage.tsx`s `syncedExistingIdRef`. Save sendet immer das volle Draft-Objekt (nie eine Sparse-Delta), da `useUpdateEmailBranding`s Vertrag ein weggelassenes Feld unverändert lässt, aber ein explizites `null` cleared — so cleared „Bild entfernen" zuverlässig. Jeder Bild-Slot (Header/Footer) besitzt eine eigene `useUploadEmailAsset()`-Instanz + eigenen Hidden-File-Input + eigenes Remove-Button (sichtbar nur wenn eine assetId gesetzt ist), gespiegelt an `BlockEditor.tsx`s `ImageBlockForm`, aber mit zusätzlichem Remove (Branding-Slots sind permanent nullbar, nicht löschbar wie ein Block). Footer-Text: lazy-geladener `MarkdownEditor` in `<Suspense>`, identisches Pattern zu `BlockEditor.tsx`s `TextBlockForm`. Icon: `PaintBrushIcon` (verifiziert als aktueller, nicht-deprecated Named-Export in `@phosphor-icons/react@2.1.10`) für Footer-Text-Sektion + Sidebar-Eintrag.

- [x] **Step 2: Route + Sidebar**

`routes.tsx`: `<Route path="email-branding" element={lazyFallback(<EmailBrandingPage />)} />`. Sidebar: Eintrag „Email branding" (i18n) in der Templates-Sektion.

> Umsetzungshinweis: i18n — neuer `sidebar.emailBranding`-Key (DE „E-Mail-Branding", EN „Email branding") sowie sechs neue Keys im bestehenden `emailTemplates`-Block (`brandingTitle`, `brandingDescription`, `brandingHeaderImage`, `brandingFooterImage`, `brandingFooterText`, `brandingFooterTextPlaceholder`) — Interface + beide Locale-Objekte synchron ergänzt. `brandingFooterText` ist ein NEUER Key für ein NEUES Feld (Seiten-Editor), nicht die Restaurierung des in Task 10 als Dead-Code entfernten `footerText`-Keys (verifiziert: 0 verbleibende Referenzen vor dieser Ergänzung). Sidebar-Eintrag als flaches `NavLink` direkt nach `<EmailTemplatesGroup />` (Muster identisch zum `/navigation`-Eintrag im „Content"-Abschnitt).

- [x] **Step 3: Build**

Run: `pnpm --filter @musiccloud/dashboard build`
Expected: kompiliert.

> Ergebnis: 0 Fehler (Typecheck + Vite-Build). `EmailBrandingPage` erscheint als eigener Lazy-Chunk (`EmailBrandingPage-*.js`) im Build-Output. `pnpm lint` (Biome): 2 Findings (Import-Sortierung, Suspense-Fallback-Formatierung) in der neuen Datei, per `biome check --write` behoben, danach clean. `pnpm doctor:diff` und `pnpm run doctor` (voller Scan, alle 4 Projekte): 0 Findings.

- [x] **Step 4: Commit**

```bash
git add apps/dashboard/src/features/templates/email-templates/EmailBrandingPage.tsx apps/dashboard/src/routes.tsx apps/dashboard/src/components/layout/Sidebar.tsx
git commit -m "Feat: global email branding settings page (MC-078)"
```

> Commit `ebf68c88`, 5 Files geändert (282 Insertions) — zusätzlich zu den drei oben genannten auch `apps/dashboard/src/routeComponents.tsx` (Step 1, pre-authorisiert) und `apps/dashboard/src/i18n/messages.ts` (Step 2, i18n-Keys).

---

## Task 12: Dashboard — System-Actions-Seite (Liste + Detail) + i18n + Invite-Picker-Entfernung

**Files:**
- Create: `apps/dashboard/src/features/system/EmailActionsPage.tsx`
- Modify: `apps/dashboard/src/routes.tsx` (Route `actions`)
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx` (System-Sektion `:744-789`)
- Modify: `apps/dashboard/src/i18n/messages.ts` (`de`/`en`: `actions`-Label + Actions-Seiten-Texte)
- Modify: `apps/dashboard/src/features/system/UserCreateCard.tsx` (welcomeTemplateId-Picker raus)
- Modify: `apps/dashboard/src/features/system/hooks/useAdminUsers.ts` (welcomeTemplateId raus)

- [x] **Step 1: Actions-Seite (Liste+Detail)**

`EmailActionsPage.tsx`: `useEmailActions` → links Liste aller Actions (Label + Required-Badge), rechts Detail der ausgewählten: Variablen-Chips (read-only), gebundene Templates mit Enable/Disable-Toggle (`useToggleBinding`) + Entfernen (`useDeleteBinding`), „+ Template zuordnen" (Select aus `useEmailTemplates`, `useCreateBinding`; Kompatibilitäts-Fehler vom Backend inline anzeigen). Muster: bestehende Liste+Detail-Navigation.

> Umsetzungshinweis: Layout als zweispaltiges Grid (`xl:grid-cols-[minmax(16rem,0.4fr)_minmax(0,1fr)]`), schmalere Listen-Spalte als bei `EmailTemplateEditPage.tsx`s Editor/Preview-Grid, da eine Liste von Action-Labels weniger Breite braucht als eine Live-Vorschau. Erstauswahl per ref-guarded `syncedRef`-Idiom (identisch zu `EmailBrandingPage.tsx`), die auf spätere User-Selektion beim Refetch nicht erneut zugreift. Toggle-Button als `DashboardButton` mit `DashboardButtonVariant.Success`/`Neutral` + `messages.services.enabled`/`disabled` (Muster 1:1 aus `PluginCard.tsx`, da `DashboardActionId` keinen eigenen „Toggle"-Actioneintrag kennt). Labels-Prop-Typ per `ReturnType<typeof useI18n>["messages"]["emailActions"]` (nicht hand-deklariertes Parallel-Interface — DRY, Muster aus `EmailTemplateEditPage.tsx`s `labels`-Prop). React-Doctor (`jsx-no-jsx-as-prop`) flaggte die inline `action.required && (<span>…)`-Badge-JSX an `DashboardSection.Item`s `addOn`-Prop (die, anders als `.Header`s `addOn`/`renderAddOn`-Paar, keine deferred-construction-Alternative hat); behoben durch Extraktion in eine eigene `ActionListRow`-Komponente mit `useMemo`-gewrappter Badge (Doctors eigener Fix-Vorschlag: „move the JSX outside the component, or wrap it in useMemo"), ohne die geteilte `DashboardSection.tsx` anzufassen. `pnpm run doctor` danach 0 Findings über alle 4 Projekte.

- [x] **Step 2: Route + Sidebar-Eintrag „Actions"**

`routes.tsx`: `<Route path="actions" element={lazyFallback(<EmailActionsPage />)} />`. In `Sidebar.tsx` System-Sektion (`:744-789`) einen `NavLink to="/actions"` mit passendem Phosphor-Icon (z.B. `LightningIcon`) + `label={s.actions}` einreihen (analog zu `/users`, `/services`).

> Umsetzungshinweis: `routeComponents.tsx` (wie bei Task 11) nicht im Plan-File-Header gelistet, aber Pflicht — `EmailActionsPage`-Lazy-Export direkt nach `SystemPage` ergänzt. `LightningIcon` vor Verwendung gegen die installierte `@phosphor-icons/react@2.1.10`-Bundle verifiziert (echter Re-Export aus `./csr/Lightning`). Sidebar-Eintrag nach `/design` einsortiert (letzter Eintrag der System-Sektion).

- [x] **Step 3: i18n**

`messages.ts`: `actions`-Key im `system`-Sidebar-Block (`de`/`en`) + ein `emailActions`-Nachrichtenblock (Titel, Required-Badge, „Bind template", „No template bound", Kompatibilitäts-Fehlertext). Beide Locales.

> Umsetzungshinweis: `actions: string;` im `layout.sidebar`-Interface direkt nach `design` (Zeile 50, wie vom Dispatcher verifiziert) + beiden Locale-Objekten ergänzt. Neuer `emailActions`-Block direkt nach `emailTemplates`s schließendem `};` eingefügt (Interface + `de` + `en`, alle drei synchron), mit 12 Keys: `title`, `requiredBadge`, `noActionSelected`, `variablesTitle`, `boundTemplatesTitle`, `noTemplateBound`, `deletedTemplateFallback`, `assignTemplateTitle`, `assignTemplatePlaceholder`, `assignTemplateAction`, `assignTemplateNoOptions`, `bindErrorFallback`.

- [x] **Step 4: welcomeTemplateId-Picker entfernen**

`UserCreateCard.tsx`: das Template-Auswahlfeld + `welcomeTemplateId`-State entfernen (Einladung nutzt jetzt automatisch die an `AdminInviteSent` gebundenen Templates). `useAdminUsers.ts`: `welcomeTemplateId` aus dem Create-Payload-Typ + Call entfernen.

> Umsetzungshinweis: Vor dem Löschen per Grep verifiziert, dass `emailTemplates`/`useEmailTemplates`, `formInputClass` und `welcomeTemplateId` in `UserCreateCard.tsx` genau je einmal (bzw. nur dort) referenziert werden — beide Imports jetzt entfernt (`useEmailTemplates`, `formInputClass`; `FormLabel`/`FormLabelText` bleiben, weiterhin für Username/Email-Labels gebraucht). 8 tote i18n-Keys unter `messages.users.createCard` per Voll-Baum-Grep verifiziert (0 externe Treffer) und entfernt: `welcomeTemplate`, `welcomeTemplateNone`, `templateVariablesLabel`, `templateVariableUsername`, `templateVariableEmail`, `templateVariableRole`, `templateVariableInviteUrl`, `templateVariableLoginUrl` (Interface + `de` + `en`). `doctor.config.ts`s `useEmailActions.ts`-Suppression-Eintrag (Task 9, „remove when Task 12 lands") entfernt, nachdem verifiziert war, dass `EmailActionsPage.tsx` den Import tatsächlich enthält — mirror des `useEmailBranding.ts`-Präzedenzfalls aus Task 11.

- [x] **Step 5: Build + Lint**

Run: `pnpm --filter @musiccloud/dashboard build && pnpm lint`
Expected: grün.

> Ergebnis: `pnpm --filter @musiccloud/dashboard build` → 0 Typecheck-Fehler, `EmailActionsPage` als eigener Lazy-Chunk im Build-Output. `pnpm lint` (Biome): 1 Formatierungsfehler (Import-Zeilenlänge, JSX-Zeilen-Kollaps) in der neuen Datei, per `biome check --write` behoben, danach clean. `pnpm run doctor` (voller Repo-Scan, alle 4 Projekte): 0 Findings (nach dem `jsx-no-jsx-as-prop`-Fix aus Step 1).

- [x] **Step 6: Commit**

```bash
git add apps/dashboard/src/features/system/EmailActionsPage.tsx apps/dashboard/src/routes.tsx apps/dashboard/src/components/layout/Sidebar.tsx apps/dashboard/src/i18n/messages.ts apps/dashboard/src/features/system/UserCreateCard.tsx apps/dashboard/src/features/system/hooks/useAdminUsers.ts
git commit -m "Feat: System Actions page + drop per-invite template picker (MC-078)"
```

> Commit `ec18a465`, 8 Files geändert (401 Insertions, 80 Deletions) — zusätzlich zu den sechs oben genannten auch `apps/dashboard/src/routeComponents.tsx` (Step 2, pre-authorisiert) und `doctor.config.ts` (Step 4, Suppression-Entfernung).

---

## Task 13: End-to-End-Verifikation + React-Doctor

**Files:** keine (Verifikation)

- [ ] **Step 1: Clean-State-Gate (monorepo-package-config-Regel)**

Run aus Repo-Root:
```bash
rm -rf packages/*/dist node_modules apps/*/node_modules
pnpm install
pnpm --filter @musiccloud/shared build
pnpm --filter @musiccloud/backend typecheck && pnpm --filter @musiccloud/backend test:run
pnpm lint
```
Expected: alles grün ohne separaten Zwischen-Build.

- [ ] **Step 2: React-Doctor auf Dashboard-Änderungen**

Run: `pnpm doctor:diff` (per `react-doctor-prevention`-Regel; NICHT `pnpm doctor` — pnpm-Builtin-Kollision)
Expected: keine neuen Findings (v.a. domain-literals: Block-Typen/Action-Keys über die shared Namespaces, keine Inline-Literale).

- [ ] **Step 3: Live-Smoke (isolierter Worktree-Server, Haupt-Checkout unberührt)**

Prod lokal spiegeln (`/db-dump`), Server starten, dann via `agent-browser` (Memory `feedback_browser_verification`):
- `/email-templates` → „New User" öffnet, Body zeigt den migrierten Text-Block, Preview rendert ohne Broken-Image (Branding-Header ist nach Migration leer bis zum Upload — erwartetes Verhalten).
- Branding-Seite: Header-Bild hochladen (`apps/frontend/public/email-header.jpg` als Datei), speichern → Preview zeigt es.
- `/actions` → `Admin invite sent` wählen, „New User" zuordnen (Kompatibilitäts-Check grün, da requiredVariables leer), aktivieren.
- Neuen Admin-User anlegen (ohne Template-Picker) → Backend-Log zeigt `triggerEmailAction`, keine 500; ohne Binding vorher: required-Fehler sichtbar.
- Console-Errors + Server-Log auf `useT`/SSR/Render-Fehler prüfen.

- [ ] **Step 4: Abschluss**

```bash
git add -A && git commit -m "Test: verify email-template-system-v2 end-to-end (MC-078)" --allow-empty
```

---

## Checkliste (Gesamt)

- [x] Task 1: Shared Block-/Action-Typen + Tests grün
- [x] Task 2: Schema additive Migration (0049) generiert + Typecheck grün
- [x] Task 3: Daten-Backfill (0050) — „New User" verlustfrei auf Blöcke, Branding-Footer geseedet, verifiziert gegen Prod-Spiegel
- [x] Task 4: Alt-Spalten gedroppt (0051), blocks NOT NULL
- [x] Task 5: Repository + Adapter (Templates/Branding/Assets/Bindings)
- [x] Task 6: Block-Renderer + globales Branding + Button-Block, Tests grün
- [x] Task 7: triggerEmailAction Fan-out + Variablen-Validierung, Tests grün
- [x] Task 8: Endpoints + Asset/Branding/Action-Routen + Invite-Umstellung, Backend grün
- [x] Task 9: Dashboard Contracts + Hooks
- [x] Task 10: Block-Editor
- [x] Task 11: Branding-Seite
- [x] Task 12: Actions-Seite + Invite-Picker entfernt + i18n
- [ ] Task 13: Clean-State-Gate + React-Doctor + Live-Smoke grün
- [ ] Alle Code-Referenzen verifiziert (functions, scripts, paths, env vars, package-manager commands)
- [x] Asset-Serve-Route-Auth-Entscheidung getroffen (public serve, admin upload) und umgesetzt — als zwei separate Route-Dateien (`email-assets.ts` public, `admin-email-assets.ts` admin), siehe Task 8 Step 2
- [ ] Phase 2 (developer-email.ts verify/reset/danger-zone → Actions) als Folge-Plan vermerkt, NICHT in diesem Plan umgesetzt

---

## Verwandt / Folge

- **Phase 2 (eigener Plan):** `developer-email.ts` (`sendDeveloperVerificationEmail`/`sendDeveloperPasswordResetEmail` + Danger-Zone-Mail) auf `triggerEmailAction` mit neuen Actions (`verify:developer`, `reset:developer`, `deleted:developer`) umstellen; der hand-gerollte `renderDeveloperEmail`-Button-HTML entfällt (Button-Block deckt ihn ab). Voraussetzung: Button-Block + Variablen-Validierung aus diesem Plan bewährt.
- **Spec:** [email-template-system-design.md](../../../docs/superpowers/specs/2026-07-01-email-template-system-design.md).
