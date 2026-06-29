# Rename AudioPlayer und ShareResult

Plan-Nr.: MC-069

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Task für Task umzusetzen. Schritte nutzen Checkbox-Syntax (`- [ ]`). Jeder Code-Block ist Biome-konform (2-Space-Indent, doppelte Anführungszeichen); vor dem Commit trotzdem `biome check --write` laufen lassen.

**Goal:** Den einen gemeinsamen Audio-Player und seinen Stack vom irreführenden `Preview`-Präfix befreien (`AudioPreviewPlayer` → `AudioPlayer` samt aller Trabanten) und den Landing-Treffer `ActiveShareResult` → `ShareResult` begradigen, ohne jede Verhaltensänderung.

**Architecture:** Reiner mechanischer Bulk-Rename. Erst die sechs Dateien per `git mv` umbenennen, dann ein Python-Skript mit Wortgrenzen-Regex (`\b`) über `apps/frontend/src` laufen lassen, das alle Symbol-Vorkommen und Import-Pfade in einem atomaren Schritt ersetzt. Anschließend die vollen Gates. Kein neues Verhalten, keine neue Datei, keine API-Änderung.

**Tech Stack:** TypeScript, React 19, Astro, Python 3 (für den Bulk-Rename), Biome, React-Doctor, vitest.

---

## Kontext (Preface)

Es gibt genau **einen** Audio-Player (`AudioPreviewPlayer`, eine Render-Stelle in `MediaCardHead.tsx`), der kommerzielle 30-Sekunden-Previews **und** volle CC-Songs abspielt. Der Begriff `Preview` stimmt für CC-Vollsongs nicht. Dieser Plan ist Schritt 1 von drei (siehe `architecture/player-architecture.html`, Abschnitt „Begradigung") und legt saubere Namen als Basis für die folgenden Pläne (VfdDisplay-Generisierung, TurntablePlayer-Hub).

**Wichtige Abgrenzung:** Nur Symbole mit `AudioPreview`/`audioPreview` im Namen werden umbenannt (der Player-Stack). Die semantisch korrekten Preview-Begriffe **bleiben unverändert**: `previewUrl`, `previewRefreshable`, die API-Route `/api/share-preview/[shortId]` und deren Datei-Pfad. Diese enthalten kein `audioPreview` und werden vom Wortgrenzen-Regex nicht erfasst.

**Bulk-Rename-Vorsichtsmaßnahmen** (siehe `~/.claude/rules/bulk-rename.md`): Das Rename läuft über ein Python-Skript, nicht über eine zsh-`for`-Schleife (zsh splittet `$FILES` nicht auf Newlines). Der External-Kollisions-Audit ist erledigt: alle Zielnamen haben 0 Treffer im Code, keine Kollision mit existierenden oder importierten Symbolen.

## Rename-Map

### Symbol-Renames (exakte Wortgrenze `\b`)

| Heute | Soll |
|---|---|
| `AudioPreviewKeyboardHandle` | `AudioKeyboardHandle` |
| `registerAudioPreviewForKeyboard` | `registerAudioForKeyboard` |
| `audioPreviewListenerRefCount` | `audioListenerRefCount` |
| `handleAudioPreviewSpacebar` | `handleAudioSpacebar` |
| `handleAudioPreviewArrows` | `handleAudioArrows` |
| `useAudioPreviewController` | `useAudioController` |
| `AudioPreviewPlayerProps` | `AudioPlayerProps` |
| `AudioPreviewStatusType` | `AudioStatusType` |
| `audioPreviewRegistry` | `audioRegistry` |
| `AudioPreviewStatus` | `AudioStatus` |
| `AudioPreviewPlayer` | `AudioPlayer` |
| `ActiveShareResult` | `ShareResult` |
| `audioPreviewSeek` | `audioSeek` |
| `audioPreviewKey` | `audioPlayerKey` |

### Datei-Renames (`git mv`)

| Heute | Soll |
|---|---|
| `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx` | `apps/frontend/src/components/audio/AudioPlayer.tsx` |
| `apps/frontend/src/components/audio/AudioPreviewPlayer.test.tsx` | `apps/frontend/src/components/audio/AudioPlayer.test.tsx` |
| `apps/frontend/src/components/audio/AudioPreviewStatus.ts` | `apps/frontend/src/components/audio/AudioStatus.ts` |
| `apps/frontend/src/components/audio/audioPreviewSeek.ts` | `apps/frontend/src/components/audio/audioSeek.ts` |
| `apps/frontend/src/components/audio/audioPreviewSeek.test.ts` | `apps/frontend/src/components/audio/audioSeek.test.ts` |
| `apps/frontend/src/components/landing/ActiveShareResult.tsx` | `apps/frontend/src/components/landing/ShareResult.tsx` |

Die Import-Pfade (`@/components/audio/AudioPreviewPlayer` usw.) enthalten den Datei-Namen als Wort und werden vom selben Symbol-Skript miterfasst, sodass sie nach dem `git mv` auf die neuen Dateien zeigen.

---

## Tasks

### Task 1: Branch anlegen

**Files:** keine

- [ ] **Step 1: Feature-Branch von aktuellem `main`**

```bash
git checkout main
git checkout -b feat/mc-069-rename-audioplayer
```

- [ ] **Step 2: Sauberen Ausgangszustand bestätigen**

Run: `git status --short`
Expected: leer (keine uncommitteten Änderungen)

### Task 2: Dateien umbenennen

**Files:** die sechs Dateien aus der Datei-Rename-Tabelle

- [ ] **Step 1: Sechs `git mv` ausführen**

```bash
cd apps/frontend/src/components
git mv audio/AudioPreviewPlayer.tsx audio/AudioPlayer.tsx
git mv audio/AudioPreviewPlayer.test.tsx audio/AudioPlayer.test.tsx
git mv audio/AudioPreviewStatus.ts audio/AudioStatus.ts
git mv audio/audioPreviewSeek.ts audio/audioSeek.ts
git mv audio/audioPreviewSeek.test.ts audio/audioSeek.test.ts
git mv landing/ActiveShareResult.tsx landing/ShareResult.tsx
cd -
```

- [ ] **Step 2: Renames verifizieren**

Run: `git status --short | grep -E "^R"`
Expected: sechs Zeilen mit `R` (renamed), je alt → neu.

### Task 3: Symbole und Import-Pfade per Skript ersetzen

**Files:** `apps/frontend/src/**/*.{ts,tsx,astro}` (Inhalte), plus temporär `scripts/rename-mc069.py`

- [ ] **Step 1: Rename-Skript schreiben**

Create: `scripts/rename-mc069.py`

```python
import re
from pathlib import Path

# Exakte-Wort-Renames (\b-Grenzen), längste zuerst (defensiv gegen Teilstrings).
SYMBOL_MAP = [
    ("AudioPreviewKeyboardHandle", "AudioKeyboardHandle"),
    ("registerAudioPreviewForKeyboard", "registerAudioForKeyboard"),
    ("audioPreviewListenerRefCount", "audioListenerRefCount"),
    ("handleAudioPreviewSpacebar", "handleAudioSpacebar"),
    ("handleAudioPreviewArrows", "handleAudioArrows"),
    ("useAudioPreviewController", "useAudioController"),
    ("AudioPreviewPlayerProps", "AudioPlayerProps"),
    ("AudioPreviewStatusType", "AudioStatusType"),
    ("audioPreviewRegistry", "audioRegistry"),
    ("AudioPreviewStatus", "AudioStatus"),
    ("AudioPreviewPlayer", "AudioPlayer"),
    ("ActiveShareResult", "ShareResult"),
    ("audioPreviewSeek", "audioSeek"),
    ("audioPreviewKey", "audioPlayerKey"),
]

patterns = [(re.compile(r"\b" + re.escape(old) + r"\b"), new) for old, new in SYMBOL_MAP]
root = Path("apps/frontend/src")
changed = 0
for path in root.rglob("*"):
    if path.suffix not in {".ts", ".tsx", ".astro"}:
        continue
    text = path.read_text()
    new_text = text
    for pat, repl in patterns:
        new_text = pat.sub(repl, new_text)
    if new_text != text:
        path.write_text(new_text)
        changed += 1
        print(f"  {path}")
print(f"{changed} files changed")
```

- [ ] **Step 2: Skript ausführen**

Run: `python3 scripts/rename-mc069.py`
Expected: Liste der geänderten Dateien, am Ende `N files changed` (rund 17).

- [ ] **Step 3: Keine Alt-Symbole mehr vorhanden**

Run: `grep -riE "audiopreview|ActiveShareResult" apps/frontend/src --include='*.ts' --include='*.tsx' --include='*.astro'`
Expected: keine Ausgabe (Exit-Code 1). Falls Treffer: prüfen, ob es ein echtes Alt-Symbol ist (dann fehlt es in der `SYMBOL_MAP`) oder ein gewolltes Vorkommen (es gibt keines).

- [ ] **Step 4: Preview-Begriffe sind erhalten geblieben (Negativ-Kontrolle)**

Run: `grep -rn "previewUrl\|previewRefreshable\|share-preview" apps/frontend/src --include='*.ts' --include='*.tsx' --include='*.astro' | head`
Expected: weiterhin Treffer (diese Begriffe wurden korrekt nicht angefasst).

- [ ] **Step 5: Rename-Skript wieder entfernen**

```bash
rm scripts/rename-mc069.py
```

### Task 4: Gates

**Files:** keine (nur Verifikation)

- [ ] **Step 1: Biome-Format auf das gesamte Frontend (organizeImports kann Import-Reihenfolge ändern)**

Run: `pnpm exec biome check --write apps/frontend/src`
Expected: `No fixes applied` oder angewandte Format-Fixes, am Ende kein Fehler.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @musiccloud/frontend exec tsc --noEmit`
Expected: keine Fehler. Insbesondere keine `has no exported member named AudioPlayer`-Fehler (das wäre die Signatur eines unvollständigen Renames).

- [ ] **Step 3: React-Doctor (voll, da uncommittete Änderungen nicht im `--diff` sichtbar sind)**

Run: `pnpm exec react-doctor . --verbose --no-score --yes --no-color --blocking warning`
Expected: `0 issues` für `@musiccloud/frontend`.

- [ ] **Step 4: Volle Test-Suite**

Run: `pnpm test:run`
Expected: alle Suites grün, insbesondere `AudioPlayer.test.tsx`, `audioSeek.test.ts`, `ShareLayout.test.tsx`, `spectrumStore.test.ts` (Frontend 282 plus, Backend unverändert).

### Task 5: Commit

**Files:** keine

- [ ] **Step 1: Alles stagen und committen**

```bash
git add -A
git commit -m "Refactor: rename AudioPreviewPlayer to AudioPlayer and ActiveShareResult to ShareResult (MC-069)

- Drop the misleading Preview prefix from the single shared audio player and its stack
- Rename the landing hit ActiveShareResult to ShareResult
- Pure mechanical rename, no behaviour change"
```

- [ ] **Step 2: gitleaks-Pre-Commit-Hook grün** (läuft automatisch beim Commit)

Expected: `no leaks found`, Commit erstellt.

---

## Checkliste (auswertbar)

- [ ] Task 1: Feature-Branch `feat/mc-069-rename-audioplayer` angelegt
- [ ] Task 2: sechs Dateien per `git mv` umbenannt
- [ ] Task 3: Symbol-Skript gelaufen, keine `audioPreview`/`ActiveShareResult`-Reste, Preview-Begriffe erhalten, Skript entfernt
- [ ] Task 4: Biome, tsc, React-Doctor (0 issues), `pnpm test:run` grün
- [ ] Task 5: committet, gitleaks grün
- [ ] Alle Code-Referenzen verifiziert (Symbole, Datei-Pfade, Zielnamen-Kollisionscheck)

## Verified Facts (Stand 2026-06-29)

| Referenz | Verifikation |
|---|---|
| Plan-Nr. `MC-069` | `~/.local/bin/plans next` |
| 14 Symbole (`AudioPreviewStatus` ×53, `AudioPreviewPlayer` ×19, `audioPreviewRegistry` ×5, `audioPreviewListenerRefCount` ×5, `AudioPreviewKeyboardHandle` ×4, `handleAudioPreviewSpacebar`/`handleAudioPreviewArrows`/`AudioPreviewStatusType`/`AudioPreviewPlayerProps` ×3, `useAudioPreviewController`/`registerAudioPreviewForKeyboard`/`audioPreviewSeek`/`audioPreviewKey` ×2) | `grep -rhioE "[a-z]*audiopreview[a-z]*" apps/` + `grep -rhoE "...ActiveShareResult..."` |
| `ActiveShareResult` in 2 Dateien (`LandingPage.tsx`, `ActiveShareResult.tsx`) | `grep -rln ActiveShareResult apps/` |
| 17 betroffene Dateien, 6 Datei-Renames | `grep -rliE audiopreview apps/` + `find apps -iname '*AudioPreview*' -o -iname 'ActiveShareResult*'` |
| Alle Zielnamen (`AudioPlayer`, `AudioStatus`, `AudioStatusType`, `AudioPlayerProps`, `AudioKeyboardHandle`, `useAudioController`, `audioRegistry`, `ShareResult`) haben 0 Treffer | `grep -rwn "<name>" apps/` für jeden, alle 0 |
| `previewUrl`/`previewRefreshable`/`share-preview` enthalten kein `audioPreview`, bleiben | `grep -rhoE "previewUrl\|sharePreview\|previewRefreshable"` |
| Gate-Commands (`biome check --write`, `tsc --noEmit`, `react-doctor`, `pnpm test:run`) | Memory `feedback_pre_push_gates`, `project_doctor_command_pitfalls` |

## Offene Punkte

Keiner. Reiner Rename ohne Produkt-Entscheidung.

## Risiken / Hinweise

- **Teilstring-Sicherheit:** Der Regex nutzt `\b`-Wortgrenzen, daher matcht `\bAudioPreviewStatus\b` nicht `AudioPreviewStatusType` (zwischen `Status` und `Type` liegt keine Grenze). Beide Symbole haben eigene Map-Einträge. Die Reihenfolge (längste zuerst) ist zusätzliche Absicherung.
- **Import-Pfade:** Werden vom selben Skript erfasst, weil der Datei-Name als Wort im Pfad steht. Nach `git mv` zeigen sie auf die neuen Dateien. Der Typecheck (Task 4 Step 2) ist das Gate dafür.
- **`/api/share-preview/[shortId]`:** Bleibt unverändert (kein `audioPreview` im Pfad). Falls die Datei ein Audio-Symbol importiert, ändert das Skript nur dieses Symbol, nicht den Routen-Pfad.
- **Folgepläne:** MC-070 (VfdDisplay generisch + Sonderformen) und MC-071 (TurntablePlayer-Hub) setzen auf den hier begradigten Namen auf.
