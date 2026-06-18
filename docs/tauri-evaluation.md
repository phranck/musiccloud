# Tauri als möglicher Ersatz für die native Apple-App

**Datum:** 2026-06-13
**Status:** Gedankenspiel, zurückgestellt. Keine Entscheidung, kein aktiver Plan.
**Kontext:** Entstanden aus der Frage, wie sich die Web-Oberfläche „wie eine native Desktop-App" anfühlen lässt (visionOS-Glas, flüssige Übergänge). Daraus ergab sich die Überlegung, ob Tauri die bestehende native Apple-App ersetzen und zusätzlich Windows, Linux und Android abdecken könnte.

## Was die bestehende Apple-App ist

Eine ausgewachsene Multiplatform-App, kein dünner Client. Stand der Analyse: ~6.378 Zeilen Swift in einem Xcode-Projekt (`apps/Apple/`), iOS und macOS aus geteiltem Code, plus eine ShareExtension und Tests.

Kernstück ist der `ClipboardMonitor` (`App/Shared/Managers/ClipboardMonitor.swift`): ein Timer pollt jede Sekunde die Zwischenablage, erkennt Streaming-Links über `StreamingServices`, löst sie via `MusicCloudAPI` zu Short-Links auf, lädt Artwork, schreibt das Ergebnis zurück in die Zwischenablage und legt es in der History (SwiftData) ab.

Drumherum tiefe OS-Integration:

- **macOS-Menubar** als manuelles `NSStatusItem` + `NSPanel` (bewusst nicht `MenuBarExtra`, um das Icon während des Auflösens animieren zu können), globaler Event-Monitor fürs Auto-Schließen, eigene Dashboard- und Settings-Fenster, `LSUIElement` (kein Dock-Icon).
- **iOS** als normale fensterbasierte App (`ContentView`, Home/History/Settings), URL-Scheme `musiccloud://resolve`, Haptics.
- **Shared:** SwiftData-Persistenz (App-Group-Store), `MusicCloudAPI`, `NotificationManager`, `TelemetryClient`/Diagnostics, AppIntents.
- **ShareExtension** für die System-Teilen-Funktion.
- Frameworks: SwiftUI (42x), SwiftData (12x), AppKit (9x), UIKit (5x), AppIntents, UserNotifications, ServiceManagement (Login-Item), Security (Keychain), AVFoundation, UniformTypeIdentifiers.

## Wie gut ist Tauri (Stand 2026)

Tauri 2.0 ist auf dem Desktop produktionsreif und wird real eingesetzt. Der bewusste Kern-Trade-off: Tauri bündelt kein Chromium, sondern nutzt das **System-WebView** (WebKit auf macOS, WebView2 auf Windows, WebKitGTK auf Linux).

- **Stärken:** winzige Binaries (~600KB bis wenige MB), sehr niedriger Idle-Verbrauch (eine Fallstudie: ~14MB RAM, <1% CPU), Rust-Backend ohne Runtime. Deckt die Vorgaben „lightweight" und „energieschonend" exakt ab.
- **Schwächen:** keine Kontrolle über die Render-Engine, also Rendering-Unterschiede pro Plattform und Feature-Verfügbarkeit je nach OS-Version. macOS-Apps sind auf 60fps gedeckelt (WKWebView), kein ProMotion-120fps. (Für unseren Fall irrelevant: der Hintergrund-Shader läuft ohnehin mit 10-12fps-Cap, und ohne ProMotion-Monitor ist 60fps keine Einschränkung.)
- Mobile (iOS/Android) ist seit 2.0 dabei, aber jünger; die CI/CD-Automatisierung fürs Mobile-Building war zuletzt noch nicht vollständig.

## Feature-Mapping

| Feature der App | Tauri-Deckung |
|---|---|
| macOS-Menubar (`NSStatusItem` + Popover-Panel) | Ja, etabliertes Pattern (Tray + `tauri-plugin-nspopover` + positioner) |
| Natives Glas/Vibrancy im Panel | Ja, `window-vibrancy` / NSVisualEffectView. Genau das gewünschte Material, gratis vom OS |
| Clipboard-Monitoring (Desktop) | Ja, Rust-seitiges Polling oder clipboard-Plugin |
| Clipboard-Auto (iOS) | Plattform-Limit, in der nativen App schon eingeschränkt (kein Background, Privacy-Banner) |
| SwiftData-History | Neu bauen: SQLite-Plugin |
| Notifications / Login-Item / Keychain | Ja, je ein Plugin (notification, autostart, stronghold) |
| ShareExtension | Nein. Bleibt nativer Swift/Kotlin-Code neben Tauri |
| AppIntents (Shortcuts/Siri) | Nein. Bleibt nativ oder entfällt |
| Icon-Animation während Resolve | Fummelig: Tray-Icon-Frames durchwechseln statt SwiftUI-View |
| Natives Vibrancy auf Linux | Nein, dort wieder CSS-Approximation |

## Einordnung

1. **Es wäre eine Neuentwicklung, kein Port.** Die ~6.378 Zeilen Swift kommen nicht mit. Sie würden ersetzt durch Web-Frontend plus Rust/Plugins. Die App ist die konzeptionelle Vorlage, nicht die Codebasis.
2. **Der eigentliche strategische Gewinn ist Code-Sharing mit dem Web-Frontend.** `apps/frontend` ist bereits eine React-App. Eine Tauri-Desktop-App rendert Web, also könnten Menubar-UI und Web-App sich Komponenten teilen, statt SwiftUI und React getrennt zu pflegen.
3. **„Crossplatform inkl. Mobile" braucht zwei UI-Paradigmen.** Auf dem Desktop eine Menubar-App, auf iOS/Android eine normale App (wie die iOS-`ContentView` heute). Das Auto-Clipboard-Feature ist auf Mobile ohnehin plattformbeschränkt, daran ändert Tauri nichts.

**Unterm Strich:** Für Desktop-Crossplatform (macOS + Windows + Linux) ist Tauri ein sehr guter Fit, mit dem nativen Glas-Material als Bonus genau dort, wo es gewünscht ist. Der Preis: Rendering-Unterschiede pro OS, ShareExtension/AppIntents bleiben native Inseln, und auf Linux kein natives Vibrancy.

## Nächster Schritt, falls aufgegriffen

Ein kleiner Spike statt weiterer Theorie: eine minimale Tauri-Menubar-App mit nativem Vibrancy-Panel und Clipboard-Polling. Damit lassen sich in einer halben Sitzung die drei entscheidenden Fragen beantworten: Sieht das native Glas so aus wie gewünscht? Ist das Tray-Popover-Verhalten gut genug? Wie fühlt sich das Code-Sharing mit dem Frontend an?

## Quellen

- [Tauri 2.0 Stable](https://v2.tauri.app/blog/tauri-20/)
- [Tauri vs Electron 2026](https://tech-insider.org/tauri-vs-electron-2026/)
- [Tauri v2 Review (andamp)](https://medium.com/andamp/tauri-v2-one-codebase-4-all-909a07e9c827)
- [Desktop-Overlay-Fallstudie 2026](https://blog.manasight.gg/why-i-chose-tauri-v2-for-a-desktop-overlay/)
- [Tauri 2.0 Mobile (AlternativeTo)](https://alternativeto.net/news/2024/10/tauri-2-0-enhances-cross-platform-app-development-with-mobile-support-and-improved-plugins)
- [Menubar-App mit Tauri v2 (DEV)](https://dev.to/hiyoyok/building-a-menubar-app-with-tauri-v2-what-nobody-tells-you-9a2)
- [tauri-macos-menubar-app-example](https://github.com/ahkohd/tauri-macos-menubar-app-example)
- [tauri-nspopover-plugin](https://github.com/freethinkel/tauri-nspopover-plugin)
- [window-vibrancy](https://github.com/tauri-apps/window-vibrancy)
