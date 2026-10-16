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

    @State private var selectedFilter: MediaFilter = .all

    var body: some View {
        // Every card renders its own glass, like the tiles in Control Center.
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
                // One animation for every way the filter changes: the
                // segments, Cmd plus a digit, and a conversion.
                .animation(.smooth, value: selectedFilter)
            }

            HStack(spacing: PanelMetrics.spacing) {
                PanelSection(interactive: true) {
                    DashboardItem()
                }
                PanelSection(interactive: true) {
                    SettingsItem()
                }
                PanelSection(interactive: true) {
                    AboutItem()
                }
                PanelSection(interactive: true) {
                    QuitItem()
                }
            }
        }
        .padding(PanelMetrics.spacing)
        .frame(width: PanelMetrics.panelWidth)
        .padding(PanelMetrics.shadowMargin)
        .frame(maxHeight: .infinity, alignment: .top)
        .followsConversions(of: monitor, filter: $selectedFilter)
        .background(WindowKeyMonitor(closesOnEscape: false) { number in
            if let filter = MediaFilter(commandNumber: number) { selectedFilter = filter }
        })
    }
}

// MARK: - FilterPicker

private struct FilterPicker: View {
    @Binding var selection: MediaFilter

    var body: some View {
        Picker(String(localized: "Filter"), selection: $selection) {
            ForEach(MediaFilter.allCases) { item in
                Label(item.title, systemImage: item.icon)
                    .tag(item)
            }
        }
        .pickerStyle(.segmented)
        .labelStyle(.titleAndIcon)
        .labelsHidden()
        .frame(maxWidth: .infinity)
        .help(String(localized: "Switch with ⌘1 to ⌘4"))
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

// MARK: - FilteredHistory

private struct FilteredHistory: View {
    let entries: [MediaEntry]
    let filter: MediaFilter

    var body: some View {
        let filtered = filter.filtered(entries, searchText: "")
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
