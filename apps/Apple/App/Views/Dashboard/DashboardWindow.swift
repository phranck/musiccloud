//
//  DashboardWindow.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import AppKit
import SwiftData
import SwiftUI

/// The main dashboard window with sidebar navigation.
///
/// Provides access to history (tracks, albums, artists).
struct DashboardWindow: View {
    @State private var selection: SidebarItem? = .tracks
    @AppStorage("dashboard.sidebarWidth") private var sidebarWidth: Double = 200

    var body: some View {
        NavigationSplitView {
            DashboardSidebar(selection: $selection, sidebarWidth: $sidebarWidth)
        } detail: {
            DashboardDetail(selection: selection)
        }
        .navigationTitle("")
        .frame(minWidth: 800, minHeight: 500)
        .onKeyPress(.escape) {
            NSApp.keyWindow?.close()
            return .handled
        }
    }
}

// MARK: - DashboardSidebar

private struct DashboardSidebar: View {
    @Environment(\.modelContext) private var modelContext
    @Binding var selection: SidebarItem?
    @Binding var sidebarWidth: Double

    @State private var counts: [SidebarItem: Int] = [:]

    var body: some View {
        List(selection: $selection) {
            Section(String(localized: "History")) {
                ForEach(SidebarItem.allCases, id: \.self) { item in
                    Label(item.title, systemImage: item.icon)
                        .tag(item)
                        .badge(counts[item] ?? 0)
                }
            }
        }
        .listStyle(.sidebar)
        .navigationSplitViewColumnWidth(min: 180, ideal: sidebarWidth, max: 300)
        .onAppear { fetchCounts() }
        .onReceive(NotificationCenter.default.publisher(for: .historyDidChange)) { _ in
            fetchCounts()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didEndLiveResizeNotification)) { notification in
            guard let window = notification.object as? NSWindow,
                  window.frameAutosaveName == "DashboardWindow",
                  let splitView = window.contentView?.findFirst(NSSplitView.self),
                  !splitView.arrangedSubviews.isEmpty else { return }
            sidebarWidth = splitView.arrangedSubviews[0].frame.width
        }
    }
}

// MARK: - Private API

private extension DashboardSidebar {
    func fetchCounts() {
        var result: [SidebarItem: Int] = [:]
        for item in SidebarItem.allCases {
            let mediaType = item.mediaType
            let descriptor = FetchDescriptor<MediaEntry>(
                predicate: #Predicate { $0.mediaType == mediaType }
            )
            result[item] = (try? modelContext.fetchCount(descriptor)) ?? 0
        }
        counts = result
    }
}

// MARK: - DashboardDetail

private struct DashboardDetail: View {
    let selection: SidebarItem?

    var body: some View {
        if let selection {
            HistoryView(filter: selection)
        } else {
            Text(String(localized: "Select an item"))
                .foregroundStyle(.secondary)
        }
    }
}
