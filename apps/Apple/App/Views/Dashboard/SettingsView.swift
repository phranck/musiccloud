//
//  SettingsView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import SwiftUI

// MARK: - SettingsView

struct SettingsView: View {
    @State private var selection: SettingsItem? = .general

    var body: some View {
        NavigationSplitView(columnVisibility: .constant(.doubleColumn)) {
            SettingsSidebar(selection: $selection)
                .toolbar(removing: .sidebarToggle)
                .toolbar(removing: .title)
        } detail: {
            SettingsDetail(selection: selection)
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 400, minHeight: 500)
        .onKeyPress(.escape) {
            NSApp.keyWindow?.close()
            return .handled
        }
    }
}

// MARK: - Settings Items

private enum SettingsItem: String, Hashable, CaseIterable {
    case general
}

private extension SettingsItem {
    var title: String {
        switch self {
        case .general: String(localized: "General")
        }
    }

    var icon: String {
        switch self {
        case .general: "gearshape"
        }
    }
}

// MARK: - SettingsSidebar

private struct SettingsSidebar: View {
    @Binding var selection: SettingsItem?

    var body: some View {
        List(selection: $selection) {
            ForEach(SettingsItem.allCases, id: \.self) { item in
                Label(item.title, systemImage: item.icon)
                    .tag(item)
            }
        }
        .navigationSplitViewColumnWidth(min: 200, ideal: 200, max: 200)
    }
}

// MARK: - SettingsDetail

private struct SettingsDetail: View {
    let selection: SettingsItem?

    var body: some View {
        switch selection {
        case .general:
            GeneralSettingsView()
        case nil:
            Text(String(localized: "Select a category"))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - GeneralSettingsView

private struct GeneralSettingsView: View {
    var body: some View {
        ContentUnavailableView {
            Label(String(localized: "General"), systemImage: "gearshape")
        } description: {
            Text(String(localized: "Coming soon."))
        }
    }
}
