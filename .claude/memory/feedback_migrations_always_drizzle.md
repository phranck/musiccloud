---
name: Migrations laufen IMMER via Drizzle in Production
description: Nie raw SQL-Runner, nie manuelle DB-Fixes, nie zerops initCommand-Skripte vorschlagen. Alles via drizzle-orm Migrator. Bei Fehlschlag: retry.
type: feedback
originSessionId: 7c1eed21-7421-45f2-a367-7fc0246f066a
---
Regel: ALLE Datenbank-Migrationen in Production laufen UNBEDINGT via Drizzle-Migrator (`drizzle-orm/node-postgres/migrator`), der beim Backend-Boot in `apps/backend/src/db/run-migrations.ts` aufgerufen wird. Schlägt ein Deploy fehl → Migration beim nächsten Boot wiederholen, niemals parallele Pfade.

**Why:** User hat diese Regel mehrfach wiederholt und ist zurecht extrem frustriert, wenn ich sie ignoriere. Alternative Pfade (separate `migrate.mjs`-Aufrufe über `zerops.yml initCommands`, Raw-SQL-Skripte, manuelle DB-Patches) sind **falsch** und werden sofort zurückgewiesen.

**How to apply:**
- Bei DB-Fehlern in Prod IMMER zuerst prüfen: ist SQL-Datei im Journal (`meta/_journal.json`)? Ist Snapshot vorhanden? Ist Migration beim letzten Boot durchgelaufen (Backend-Log)?
- Reparaturen: Journal-Einträge ergänzen, Snapshots neu generieren, Drizzle beim nächsten Boot laufen lassen — fertig.
- Niemals vorschlagen, `initCommands` um ein separates Migrations-Skript zu erweitern.
- Niemals raw SQL in Prod-Konsole ausführen, um Drizzle zu umgehen.
- Fallback-Scripts wie `scripts/migrate.mjs` sind nur lokaler Rettungsanker, nicht für Prod.
- Wenn Migration in einem Push fehlschlägt: nicht umgehen, sondern SQL fixen und erneut deployen → Drizzle retried automatisch.
