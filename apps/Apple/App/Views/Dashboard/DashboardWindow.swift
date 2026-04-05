//
//  DashboardWindow.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import SwiftUI

/// Sidebar navigation items for the dashboard.
enum SidebarItem: String, Hashable, CaseIterable {
    case tracks
    case albums
    case artists
}

/// Footer navigation items for the dashboard sidebar.
enum SidebarFooterItem: String, Hashable {
    case about
    case settings
}

/// Wrapper type for all possible navigation destinations.
enum NavigationItem: Hashable {
    case history(SidebarItem)
    case footer(SidebarFooterItem)
}

/// The main dashboard window with sidebar navigation.
///
/// Provides access to history (tracks, albums, artists), about, and settings.
struct DashboardWindow: View {
    @State private var selection: NavigationItem? = .history(.tracks)

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detail
        }
        .navigationTitle("")
        .frame(minWidth: 800, minHeight: 500)
    }
}

// MARK: - Sidebar

private extension DashboardWindow {
    var sidebar: some View {
        List(selection: $selection) {
            Section(String(localized: "History")) {
                ForEach(SidebarItem.allCases, id: \.self) { item in
                    Label(item.title, systemImage: item.icon)
                        .tag(NavigationItem.history(item))
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            sidebarFooter
        }
        .listStyle(.sidebar)
        .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 240)
    }

    var sidebarFooter: some View {
        VStack(spacing: 0) {
            Divider()
            VStack(spacing: 2) {
                footerButton(.about)
                footerButton(.settings)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
        }
    }

    func footerButton(_ item: SidebarFooterItem) -> some View {
        Button {
            selection = .footer(item)
        } label: {
            Label(item.title, systemImage: item.icon)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 4)
                .padding(.horizontal, 6)
        }
        .buttonStyle(.plain)
        .background(
            RoundedRectangle(cornerRadius: 5)
                .fill(selection == .footer(item) ? Color.accentColor.opacity(0.2) : .clear)
        )
    }
}

// MARK: - Detail

private extension DashboardWindow {
    @ViewBuilder
    var detail: some View {
        switch selection {
        case .history(let item):
            HistoryView(filter: item)
        case .footer(.about):
            AboutView()
        case .footer(.settings):
            SettingsView()
        case nil:
            Text(String(localized: "Select an item"))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - SidebarItem Helpers

extension SidebarItem {
    var title: String {
        switch self {
        case .tracks:  String(localized: "Tracks")
        case .albums:  String(localized: "Albums")
        case .artists: String(localized: "Artists")
        }
    }

    var icon: String {
        switch self {
        case .tracks:  "music.note"
        case .albums:  "square.stack"
        case .artists: "person.circle"
        }
    }

    var mediaType: String {
        switch self {
        case .tracks:  "track"
        case .albums:  "album"
        case .artists: "artist"
        }
    }
}

// MARK: - SidebarFooterItem Helpers

extension SidebarFooterItem {
    var title: String {
        switch self {
        case .about:    String(localized: "About")
        case .settings: String(localized: "Settings")
        }
    }

    var icon: String {
        switch self {
        case .about:    "info.circle"
        case .settings: "gearshape"
        }
    }
}
