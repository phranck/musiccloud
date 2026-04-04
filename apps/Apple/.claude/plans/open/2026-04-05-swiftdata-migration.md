# SwiftData Migration Plan

## Preface

Die App speichert aktuell die Conversion-History in `NSUbiquitousKeyValueStore` (iCloud Key-Value Store). Das hat ein 1MB-Limit, was mit `artworkImageData` schnell erreicht wird. Neue Eintraege werden deshalb nicht mehr persistiert, und die UI aktualisiert sich nicht.

**Ziel:** Migration auf SwiftData mit CloudKit-Sync. Damit entfaellt das 1MB-Limit, Artwork kann beliebig gross sein, und die Daten synchronisieren automatisch zwischen macOS und iOS.

## Design

### ContentType-Problem

SwiftData unterstuetzt keine Enums mit associated values. `ContentType` muss aufgeloest werden.

**Ansatz:** `MediaInfo` bekommt ein String-Feld `mediaType` (`"track"`, `"album"`, `"artist"`) und separate optionale Relationen zu `TrackInfo`, `AlbumInfo`, `ArtistInfo` als eingebettete SwiftData-Models. Der bestehende `ContentType` Enum bleibt als computed property erhalten, damit die Views unveraendert bleiben.

### Model-Architektur

```
@Model MediaInfo
├── id: UUID
├── originalUrl: String
├── shortUrl: String
├── mediaType: String          // "track", "album", "artist"
├── artworkImageData: Data?    // @Attribute(.externalStorage)
├── date: Date
├── track: TrackInfoModel?     // embedded
├── album: AlbumInfoModel?     // embedded
└── artist: ArtistInfoModel?   // embedded

// Computed (nicht persistiert):
├── contentType: ContentType   // rekonstruiert aus mediaType + track/album/artist
```

`TrackInfo`, `AlbumInfo`, `ArtistInfo` bleiben als Codable Structs fuer die API-Schicht bestehen. Neue `TrackInfoModel`, `AlbumInfoModel`, `ArtistInfoModel` Codable Structs werden fuer die SwiftData-Einbettung erstellt (oder die bestehenden werden direkt eingebettet, da SwiftData Codable Structs als transformable speichern kann).

**Vereinfachung:** SwiftData kann `Codable`-Structs direkt als transformable Properties speichern. Wir brauchen keine separaten Model-Klassen - wir speichern `TrackInfo?`, `AlbumInfo?`, `ArtistInfo?` direkt.

### HistoryManager

Wird zu einem Wrapper um `ModelContext`. Behaelt die gleiche Public API (`add`, `remove`, `clear`, `entries`, `mostRecent`), nutzt intern aber SwiftData Queries.

**Option A:** HistoryManager behaelt `entries` als computed property mit `FetchDescriptor`.
**Option B:** Views nutzen `@Query` direkt, HistoryManager nur noch fuer Mutationen.

**Empfehlung:** Option B - Views nutzen `@Query`, HistoryManager wird zu einem reinen Write-Service. Das ist idiomatischer SwiftData-Code und loest auch das Reaktivitaets-Problem (die Views updaten automatisch bei DB-Aenderungen).

## Implementation

### Schritt 1: SwiftData Model erstellen

**Neue Datei:** `App/Models/MediaEntry.swift`

```swift
@Model
final class MediaEntry {
    @Attribute(.unique) var id: UUID
    var originalUrl: String
    var shortUrl: String
    var mediaType: String
    @Attribute(.externalStorage) var artworkImageData: Data?
    var date: Date

    // Codable structs als transformable
    var track: TrackInfo?
    var album: AlbumInfo?
    var artist: ArtistInfo?

    // Computed property fuer View-Kompatibilitaet
    var contentType: ContentType { ... }
}
```

- `@Attribute(.externalStorage)` lagert grosse Bilder automatisch als Dateien aus
- `@Attribute(.unique)` auf `id` verhindert Duplikate beim CloudKit-Sync

### Schritt 2: ModelContainer konfigurieren

**Aendern:** `App/AppDelegate.swift` und `App/App.swift`

- `ModelContainer` erstellen mit `MediaEntry` Schema
- CloudKit-Container konfigurieren
- `ModelContext` per `.modelContainer()` oder `.environment(\.modelContext)` bereitstellen

### Schritt 3: HistoryManager refactoren

**Aendern:** `App/Manager/HistoryManager.swift`

- Entfernt: `NSUbiquitousKeyValueStore`, `entries` Array, `save()`, `loadEntries()`, `setupCloudSync()`
- Behaelt: `add()`, `remove()`, `clear()` - jetzt mit `ModelContext`
- Braucht: `ModelContext` Dependency (per init oder Environment)

### Schritt 4: Views auf @Query umstellen

**Aendern:**
- `App/Views/Menu/MenuBarView.swift` - `@Query` statt `historyManager.entries`
- `App/Views/Dashboard/HistoryView.swift` - `@Query` mit Predicate-Filter
- `App/Views/Dashboard/DashboardWindow.swift` - Environment anpassen
- `App/Views/Media Content/MediaSection.swift` - Parameter-Typ aendern
- `App/Views/Media Content/MediaRow.swift` - Parameter-Typ aendern
- `App/Views/Media Content/MediaItem.swift` - Parameter-Typ aendern

### Schritt 5: ClipboardMonitor anpassen

**Aendern:** `App/Manager/ClipboardMonitor.swift`

- `MediaInfo` Erstellung durch `MediaEntry` ersetzen
- `historyManager.add(entry)` Aufrufe anpassen
- Duplicate-Check (`originalUrl`) per `FetchDescriptor` mit Predicate

### Schritt 6: NotificationManager anpassen

**Aendern:** `App/Manager/NotificationManager.swift`

- Parameter-Typ von `MediaInfo` auf `MediaEntry` aendern

### Schritt 7: ResolveResponse anpassen

**Aendern:** `App/API/ResolveResponse.swift`

- `contentType` computed property bleibt
- Neue Methode: `toMediaEntry(originalUrl:shortUrl:artworkData:)` erstellt ein `MediaEntry`

### Schritt 8: Entitlements & Capabilities

**Aendern:** `App/Supporting Files/musiccloud.entitlements`

- CloudKit Container hinzufuegen: `iCloud.io.musiccloud.app`
- iCloud Services: `CloudKit` aktivieren

**Xcode:**
- Signing & Capabilities: "iCloud" hinzufuegen, "CloudKit" aktivieren
- Container erstellen: `iCloud.io.musiccloud.app`

### Schritt 9: Alte Daten migrieren

Beim ersten Start nach dem Update:
- Vorhandene Daten aus `NSUbiquitousKeyValueStore` lesen
- In SwiftData importieren
- KVS-Daten loeschen

## Betroffene Dateien

| Datei | Aktion |
|---|---|
| `App/Models/MediaEntry.swift` | **Neu** - SwiftData @Model |
| `App/Manager/HistoryManager.swift` | **Rewrite** - ModelContext statt KVS |
| `App/Manager/ClipboardMonitor.swift` | **Aendern** - MediaEntry statt MediaInfo |
| `App/Manager/NotificationManager.swift` | **Aendern** - MediaEntry Parameter |
| `App/AppDelegate.swift` | **Aendern** - ModelContainer Setup |
| `App/App.swift` | **Aendern** - ModelContainer Setup |
| `App/API/ResolveResponse.swift` | **Aendern** - toMediaEntry() Methode |
| `App/API/Models/MediaInfo.swift` | **Behalten** - ContentType Enum bleibt fuer API |
| `App/Views/Menu/MenuBarView.swift` | **Aendern** - @Query |
| `App/Views/Dashboard/HistoryView.swift` | **Aendern** - @Query mit Filter |
| `App/Views/Dashboard/DashboardWindow.swift` | **Aendern** - Environment |
| `App/Views/Media Content/MediaSection.swift` | **Aendern** - Parameter-Typ |
| `App/Views/Media Content/MediaRow.swift` | **Aendern** - Parameter-Typ |
| `App/Views/Media Content/MediaItem.swift` | **Aendern** - Parameter-Typ |
| `App/Views/EnvironmentWrapper.swift` | **Aendern** - ModelContainer |
| `App/Supporting Files/musiccloud.entitlements` | **Aendern** - CloudKit |

## Checklist

- [ ] `MediaEntry` @Model erstellen
- [ ] ModelContainer in AppDelegate und App.swift konfigurieren
- [ ] HistoryManager auf ModelContext umstellen
- [ ] Views auf @Query umstellen
- [ ] ClipboardMonitor anpassen
- [ ] NotificationManager anpassen
- [ ] ResolveResponse anpassen
- [ ] Entitlements fuer CloudKit konfigurieren
- [ ] KVS-Datenmigration implementieren
- [ ] ContentType Enum und API-Models (TrackInfo etc.) behalten
- [ ] Bauen und testen (macOS)
- [ ] Bauen und testen (iOS)
- [ ] CloudKit-Sync verifizieren
