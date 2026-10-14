#if os(macOS)
//
//  SettingsSidebar.swift
//  musiccloud
//

import SwiftUI

// MARK: - SettingsSidebar

/// The sidebar of the Settings window, listing every ``SettingsPane``.
///
/// A click on the selected row would clear a `List` selection. The binding
/// ignores that, so the window always shows a pane.
struct SettingsSidebar: View {
    /// The pane the window shows.
    @Binding var selection: SettingsPane

    var body: some View {
        List(SettingsPane.allCases, selection: selectionBinding) { pane in
            Label(pane.title, systemImage: pane.icon)
                .tag(pane)
        }
        .listStyle(.sidebar)
    }

    /// The list selects optionally, the window always shows a pane.
    private var selectionBinding: Binding<SettingsPane?> {
        Binding(
            get: { selection },
            set: { if let pane = $0 { selection = pane } }
        )
    }
}

#endif
