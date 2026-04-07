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
        VStack(spacing: PanelMetrics.spacing) {
            PanelSection {
                HeaderRow(status: monitor.status)
            }

            if let error = monitor.status.errorMessage {
                PanelSection(padding: 12) {
                    ErrorRow(message: error)
                }
            }

            PanelSection {
                VStack(spacing: 0) {
                    FilterPicker(selection: $selectedFilter)
                    FilteredHistory(entries: entries, filter: selectedFilter)
                        .frame(minHeight: 250, alignment: .top)
                }
            }

            HStack(spacing: PanelMetrics.spacing) {
                PanelSection(hoverable: true) {
                    DashboardItem()
                }
                PanelSection(hoverable: true) {
                    SettingsItem()
                }
                PanelSection(hoverable: true) {
                    QuitItem()
                }
            }
        }
        .padding(PanelMetrics.spacing)
        .frame(width: 320)
        .frame(maxHeight: .infinity, alignment: .top)
        .onAppear { fetchEntries() }
        .onReceive(NotificationCenter.default.publisher(for: .historyDidChange)) { _ in
            fetchEntries()
        }
    }
}

// MARK: - Private API

private extension MenuBarView {
    func fetchEntries() {
        let descriptor = FetchDescriptor<MediaEntry>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        do {
            entries = try modelContext.fetch(descriptor)
        } catch {
            AppLogger.history.error("Failed to fetch entries: \(error.localizedDescription)")
            entries = []
        }
    }
}

// MARK: - FilterPicker

private struct FilterPicker: View {
    @Binding var selection: SidebarItem

    var body: some View {
        AnimatedSegmentControl(
            selection: $selection,
            segments: SidebarItem.allCases.map { item in
                .label(item.title, systemImage: item.icon, tag: item)
            },
            tintColor: .accentColor
        )
        .controlSize(.regular)
        .segmentControlWidth(.fullWidth)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

// MARK: - FilteredHistory

private struct FilteredHistory: View {
    let entries: [MediaEntry]
    let filter: SidebarItem

    var body: some View {
        let filtered = entries.filter { $0.mediaType == filter.mediaType }
        if filtered.isEmpty {
            VStack(spacing: PanelMetrics.spacing) {
                Spacer()
                Image(systemName: filter.icon)
                    .font(.system(size: 28))
                    .foregroundStyle(.secondary)
                Text(filter.emptyPanelTitle)
                    .font(.title3)
                    .foregroundStyle(.primary)
                Spacer()
            }
            .frame(maxWidth: .infinity, minHeight: 120)
        } else {
            MediaSection(history: Array(filtered.prefix(8)))
        }
    }
}
