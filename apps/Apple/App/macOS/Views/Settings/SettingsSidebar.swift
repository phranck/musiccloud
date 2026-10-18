#if os(macOS)
//
//  SettingsSidebar.swift
//  musiccloud
//

import SwiftUI

// MARK: - SettingsSidebar

/// The sidebar of the Settings window, listing every ``SettingsPane``.
///
/// The settings are listed from the top. Panes that are not settings, such
/// as About, sit at the bottom edge in a second sidebar list that shares the
/// selection, because a sidebar `List` cannot pin a row to its bottom.
///
/// A click on the selected row would clear a `List` selection. The binding
/// ignores that, so the window always shows a pane.
struct SettingsSidebar: View {
    /// The pane the window shows.
    @Binding var selection: SettingsPane

    @Environment(\.sidebarRowSize) private var rowSize

    var body: some View {
        SidebarList(panes: SettingsPane.topPanes, selection: selectionBinding).safeAreaInset(edge: .bottom, spacing: 0) {
            SidebarList(panes: SettingsPane.bottomPanes, selection: selectionBinding).scrollDisabled(true).frame(
                height: Self.bottomListHeight(rows: SettingsPane.bottomPanes.count, rowSize: rowSize)
            )
        }
    }

    /// The list selects optionally, the window always shows a pane.
    private var selectionBinding: Binding<SettingsPane?> { Binding(get: { selection }, set: { if let pane = $0 { selection = pane } }) }

    /// The height of the bottom list: its rows plus the sidebar's vertical
    /// inset of 10 points above and below. The row heights follow the
    /// "Sidebar icon size" setting in System Settings > Appearance, which
    /// `sidebarRowSize` reports; the previews below render all three.
    private static func bottomListHeight(rows: Int, rowSize: SidebarRowSize) -> CGFloat {
        let rowHeight: CGFloat =
            switch rowSize {
            case .small: 24
            case .large: 40
            default: 32
            }
        return CGFloat(rows) * rowHeight + 20
    }
}

// MARK: - SidebarList

private struct SidebarList: View {
    let panes: [SettingsPane]
    @Binding var selection: SettingsPane?

    var body: some View {
        List(panes, selection: $selection) { pane in Label(pane.title, systemImage: pane.icon).tag(pane) }.listStyle(.sidebar)
    }
}

#Preview { SettingsSidebar(selection: .constant(.about)).frame(width: 200, height: 440) }

#Preview("Small sidebar rows") {
    SettingsSidebar(selection: .constant(.about)).environment(\.sidebarRowSize, .small).frame(width: 200, height: 440)
}

#Preview("Large sidebar rows") {
    SettingsSidebar(selection: .constant(.about)).environment(\.sidebarRowSize, .large).frame(width: 200, height: 440)
}

#endif
