# Claude AI Assistant - Project Rules & Guidelines

## Code Modification Rules

### CRITICAL: Never Remove Code Without Permission
- ❌ **NEVER** remove code, features, or functionality on your own
- ✅ **ALWAYS ASK FIRST** if you think something should be removed
- This includes:
  - UI elements (buttons, labels, icons)
  - Functions or methods
  - Properties or variables
  - Comments or documentation
- **Exception:** code that is provably dead may be removed without asking. Dead means nothing in the app, the extension or the tests references it, apart from its own tests. Name what was removed when reporting the change.

### General Guidelines
- When making changes, preserve existing functionality unless explicitly asked to remove it
- If unsure about whether to keep something, ask the user first
- Modifications should be additive or refactoring-focused, not destructive

## Project-Specific Notes

### musiccloud App
- Menu bar application for converting streaming URLs
- Uses SwiftUI for UI
- macOS-focused design (native menu bar styling)
- Key features:
  - Clipboard monitoring
  - URL shortening/conversion
  - Track metadata display
  - History management with iCloud sync

### Menu bar panel: single glass cards

The panel looks like Control Center on macOS 26: separate Liquid Glass cards over the desktop, with nothing behind them. Every part of the setup below is needed for that.

- **Each card is its own AppKit `NSGlassEffectView`** (`PanelSection` in `App/macOS/Views/Components/PanelSection.swift`). SwiftUI's `glassEffect` only renders glass in this transparent window inside a `GlassEffectContainer`, and that container draws one shared surface behind all cards.
- **No `GlassEffectContainer` and no backdrop.** A `NSVisualEffectView` or `NSGlassEffectView` behind the cards shows as a frame around all of them.
- **No window shadow** (`panel.hasShadow = false` in `AppDelegate.setupPanel()`). The window is transparent, so the window server casts a shadow around every card's outline.
- **A transparent margin around the cards** (`PanelMetrics.shadowMargin`, 32 pt). The glass casts its own shadow, and a window edge close to the cards cuts it off as a hard rectangle. `openPanel()` shifts the window up by the margin so the cards stay below the menu bar. Clicks pass through the transparent margin.
- **Hover uses one system fill**, `PanelMetrics.hoverFill`. The footer cards tint their glass with it, and the history rows fill their background with it.

---
*Last updated: 2026-10-14*
