#if os(macOS)
//
//  MenuBarView.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import AppKit
import SwiftData
import SwiftUI

// MARK: - MenuBarView

struct MenuBarView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Query(sort: \MediaEntry.date, order: .reverse)
    private var entries: [MediaEntry]

    @State private var selectedFilter: MediaFilter = .tracks

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
        .onChange(of: monitor.status) {
            if case .success(_, let mediaType) = monitor.status {
                selectedFilter = MediaFilter(for: mediaType)
            }
        }
    }
}

// MARK: - FilterPicker

private struct FilterPicker: View {
    @Binding var selection: MediaFilter

    var body: some View {
        AnimatedSegmentControl(
            selection: $selection,
            segments: MediaFilter.mediaOnlyCases.map { item in
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
    let filter: MediaFilter

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

#endif
