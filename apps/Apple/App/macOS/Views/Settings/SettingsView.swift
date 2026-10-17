#if os(macOS)
//
//  SettingsView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import SwiftUI

// MARK: - SettingsView

/// The Settings window: a sidebar with the topics and the selected topic's
/// settings beside it, the layout of System Settings on macOS 26.
///
/// Following the HIG, the window title names the visible pane, the last
/// pane comes back when the window opens again, and the sidebar stays
/// visible because it is the window's only navigation.
struct SettingsView: View {
    /// The size of the window's content. The window does not resize, so
    /// `AppDelegate.openSettings()` opens it at exactly this size.
    static let contentSize = CGSize(width: 600, height: 440)

    @AppStorage(DefaultsKey.settingsPane) private var selectedPane: SettingsPane = .general

    var body: some View {
        NavigationSplitView {
            SettingsSidebar(selection: $selectedPane)
                .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 240)
                .toolbar(removing: .sidebarToggle)
        } detail: {
            SettingsPaneView(pane: selectedPane)
                .navigationTitle(selectedPane.title)
        }
        .background(WindowKeyMonitor())
        .frame(minWidth: Self.contentSize.width, minHeight: Self.contentSize.height)
    }
}

// MARK: - SettingsPaneView

private struct SettingsPaneView: View {
    let pane: SettingsPane

    var body: some View {
        switch pane {
        case .general:           GeneralPane()
        case .notifications:     NotificationsPane()
        case .history:           HistoryPane()
        case .socialMedia:       SocialMediaPane()
        case .streamingServices: StreamingServicesPane()
        case .templates:         TemplatesPane()
        case .about:             AboutView()
        }
    }
}

#endif
