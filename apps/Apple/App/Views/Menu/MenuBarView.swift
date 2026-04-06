//
//  MenuBarView.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftData
import SwiftUI
#if os(macOS)
import AppKit
#endif

// MARK: - MenuBarView

struct MenuBarView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Environment(\.modelContext) private var modelContext

    @State private var entries: [MediaEntry] = []
    @State private var selectedFilter: SidebarItem = .tracks

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                HeaderRow(isProcessing: monitor.status.isProcessing)

                if let error = monitor.status.errorMessage {
                    ErrorRow(message: error)
                } else {
                    filterPicker
                    filteredHistory
                }

                Divider().padding(.vertical, 4)

                DashboardMenuItem()

                Divider().padding(.vertical, 4)

                QuitMenuItem()
            }
            .padding(.vertical, 4)
            .background(Color(nsColor: .windowBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 9))
        }
        .frame(width: 320)
        .onAppear { fetchEntries() }
        .onReceive(NotificationCenter.default.publisher(for: .historyDidChange)) { _ in
            fetchEntries()
        }
    }
}

// MARK: - Private API

private extension MenuBarView {
    var filterPicker: some View {
        Picker("", selection: $selectedFilter) {
            ForEach(SidebarItem.allCases, id: \.self) { item in
                Text(item.title).tag(item)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    var filteredHistory: some View {
        let filtered = entries.filter { $0.mediaType == selectedFilter.mediaType }
        if filtered.isEmpty {
            ContentUnavailableView {
                Label(selectedFilter.emptyPanelTitle, systemImage: selectedFilter.icon)
            }
            .frame(minHeight: 80)
        } else {
            MediaSection(history: Array(filtered.prefix(10)))
        }
    }

    func fetchEntries() {
        let descriptor = FetchDescriptor<MediaEntry>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        entries = (try? modelContext.fetch(descriptor)) ?? []
    }
}

// MARK: - SidebarItem Panel Helpers

private extension SidebarItem {
    var emptyPanelTitle: String {
        switch self {
        case .tracks:  String(localized: "No Tracks")
        case .albums:  String(localized: "No Albums")
        case .artists: String(localized: "No Artists")
        }
    }
}
