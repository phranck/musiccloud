---
description: Pull a full Zerops production DB dump and restore it into the local musiccloud database
---

<objective>
Vollständigen Datenbankdump von der Zerops-Produktionsdatenbank ziehen und in die lokale Entwicklungsdatenbank einspielen.
</objective>

<quick_start>
/db-dump

Keine Argumente erforderlich. Alle Verbindungsparameter sind fest oder werden aus dem Projektmemory gelesen.
</quick_start>

<connection_params>
- **Zerops-Connection-String**: aus Projektmemory lesen (`~/.claude/projects/-Users-phranck-Sites-musiccloud-musiccloud/memory/MEMORY.md`, Abschnitt "Zerops" oder Eintrag `project_zerops_db.md`)
- **Zerops-Projekt-ID**: aus demselben Memory-Eintrag
- **Lokal**: `postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud`
- **pg_dump**: `/opt/homebrew/Cellar/libpq/18.2/bin/pg_dump`
- **pg_restore**: `/opt/homebrew/Cellar/libpq/18.2/bin/pg_restore`
- **psql**: `/opt/homebrew/Cellar/libpq/18.2/bin/psql`
</connection_params>

<rules>
- ALWAYS execute all steps sequentially. NEVER run steps in parallel.
- On any error: stop immediately and output the full error message.
- NEVER proceed to the next step if the current step failed.
- Lokaler Postgres läuft im Docker-Container `musiccloud` auf Port 5433. Der Container muss laufen, bevor restored wird.
</rules>

<workflow>
**Schritt 1: VPN-Verbindung prüfen**

Lese den Zerops-Verbindungsstring und die Projekt-ID aus dem Projektmemory und weise sie den Variablen `ZEROPS_DB_URL` und `ZEROPS_PROJECT_ID` zu.

Prüfe ob die VPN-Verbindung aktiv ist:

```bash
/opt/homebrew/Cellar/libpq/18.2/bin/psql "$ZEROPS_DB_URL" -c "SELECT 1" 2>&1
```

Wenn der Test fehlschlägt, VPN aufbauen:

```bash
sudo zcli vpn up --project-id "$ZEROPS_PROJECT_ID"
```

Nach dem VPN-Aufbau erneut prüfen. Erst wenn die Verbindung steht, mit Schritt 2 fortfahren.

**Schritt 2: Lokalen Postgres-Container prüfen**

```bash
docker ps --filter "name=^musiccloud$" --format "{{.Names}} {{.Status}}"
```

Wenn der Container nicht läuft, abbrechen mit Hinweis: lokaler Container `musiccloud` (Port 5433) muss vorher gestartet werden.

**Schritt 3: Dump ziehen**

```bash
DUMP_FILE="/tmp/musiccloud_zerops_$(date +%Y%m%d_%H%M%S).dump"
/opt/homebrew/Cellar/libpq/18.2/bin/pg_dump \
  "$ZEROPS_DB_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  -f "$DUMP_FILE"
echo "Dump gespeichert unter: $DUMP_FILE"
```

**Schritt 4: Backend-Dev-Server stoppen (falls läuft)**

Der Backend-Dev-Server hält offene Connections zur lokalen DB; `pg_restore --clean` schlägt sonst an Locks fehl.

```bash
npm run dev:stop 2>/dev/null || true
pkill -f "node dist/server.js" 2>/dev/null || true
sleep 2
```

**Schritt 5: Lokal einspielen**

```bash
/opt/homebrew/Cellar/libpq/18.2/bin/pg_restore \
  --dbname="postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "$DUMP_FILE"
```

**Schritt 6: Aufräumen**

```bash
rm "$DUMP_FILE"
echo "Temporäre Dump-Datei gelöscht."
```

**Schritt 7: Verify**

```bash
/opt/homebrew/Cellar/libpq/18.2/bin/psql \
  "postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud" \
  -c "SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;"
```

Zeigt die letzten fünf Migrations-Einträge, damit visuell verifiziert ist, dass der Tracker den Prod-Stand spiegelt.
</workflow>

<success_criteria>
Der Skill ist erfolgreich abgeschlossen wenn:

- Die VPN-Verbindung zu Zerops stand
- Der lokale Postgres-Container `musiccloud` lief
- Der Dump erfolgreich gezogen wurde
- `pg_restore` ohne Fehler abgeschlossen hat (Warnings über nicht existierende Objekte bei `--clean` sind kein Fehler)
- Die temporäre Dump-Datei gelöscht wurde
- Der Tracker-Verify-Query erfolgreich gelaufen ist und mindestens den höchsten erwarteten Migrations-Eintrag zeigt
- Eine Abschlussmeldung ausgegeben wurde mit Bestätigung, dass die lokale Datenbank `musiccloud` jetzt den Produktionsstand hat, sowie dem Zeitstempel des Dumps
</success_criteria>

<error_handling>
- **VPN-Verbindung schlägt fehl**: `sudo zcli vpn up --project-id "$ZEROPS_PROJECT_ID"` ausführen und erneut testen. Wenn auch danach keine Verbindung besteht, abbrechen.
- **pg_dump schlägt fehl**: Vollständige Fehlermeldung ausgeben, Dump-Datei falls vorhanden löschen, abbrechen.
- **pg_restore schlägt fehl mit Lock-Fehlern**: Backend-Dev-Server stoppen (Schritt 4 erneut ausführen), dann Schritt 5 wiederholen.
- **pg_restore schlägt fehl mit anderen Fehlern**: Vollständige Fehlermeldung ausgeben. Hinweis: Warnungen über nicht existierende Objekte bei `--clean --if-exists` sind normal und kein Fehler.
- **Memory-Eintrag fehlt**: Wenn `ZEROPS_DB_URL` oder `ZEROPS_PROJECT_ID` nicht im Projektmemory stehen, abbrechen mit Hinweis: User muss die Werte in `~/.claude/projects/-Users-phranck-Sites-musiccloud-musiccloud/memory/project_zerops_db.md` ablegen und in `MEMORY.md` indizieren.
</error_handling>
