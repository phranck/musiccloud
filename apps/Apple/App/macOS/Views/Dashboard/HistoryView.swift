#if os(macOS)
//
//  HistoryView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import SwiftData
import SwiftUI

/// Displays resolved media entries filtered by content type.
///
/// Supports grid display mode with search filtering.
/// The filter is controlled via a centered segmented control in the toolbar.
struct HistoryView: View {
    @Environment(HistoryManager.self) private var historyManager
    @Query(sort: \MediaEntry.date, order: .reverse, animation: .default)
    private var allEntries: [MediaEntry]

    @Binding var filter: MediaFilter

    @State private var searchText = ""
    @AppStorage("gridItemSize") private var gridItemSize: Double = 168

    private static let gridItemMinSize: CGFloat = 150

    private var filteredEntries: [MediaEntry] {
        filter.filtered(allEntries, searchText: searchText)
    }

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if filteredEntries.isEmpty {
                    emptyState
                } else {
                    gridView
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(.smooth, value: allEntries.map(\.id))

            Divider()
            bottomBar
        }
        .searchable(text: $searchText, placement: .toolbar, prompt: String(localized: "Search"))
        .background(WindowKeyMonitor())
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("", selection: $filter) {
                    ForEach(MediaFilter.mediaOnlyCases, id: \.self) { item in
                        Label(item.title, systemImage: item.icon)
                            .tag(item)
                    }
                }
                .pickerStyle(.segmented)
                .labelStyle(.titleAndIcon)
            }
        }
    }
}

// MARK: - Grid View

private extension HistoryView {
    var gridView: some View {
        ScrollView {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: max(gridItemSize, HistoryView.gridItemMinSize), maximum: gridItemSize + 40), spacing: 20)],
                spacing: 20
            ) {
                ForEach(filteredEntries) { entry in
                    HistoryGridCard(entry: entry)
                        .entryActions(entry: entry, onDelete: { historyManager.remove(entry) })
                }
            }
            .padding(20)
            .animation(.smooth(duration: 0.25), value: gridItemSize)
        }
    }
}

// MARK: - Bottom Bar

private extension HistoryView {
    var bottomBar: some View {
        HStack {
            Spacer()
            Image(systemName: "square.grid.3x3")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Slider(value: $gridItemSize, in: Double(HistoryView.gridItemMinSize)...320)
                .frame(width: 120)
            Image(systemName: "square.grid.2x2")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }
}

// MARK: - Empty State

private extension HistoryView {
    var emptyState: some View {
        ContentUnavailableView {
            Label {
                Text(filter.emptyTitle)
                    .font(.largeTitle)
                    .fontDesign(.rounded)
                    .fontWeight(.bold)
                    .foregroundColor(.primary)
                Text(filter.emptyDescription)
                    .font(.callout)
                    .fontDesign(.rounded)
                    .foregroundColor(.secondary)
            } icon: {
                Image(systemName: filter.icon)
                    .foregroundColor(.primary)
                    .symbolRenderingMode(.hierarchical)
            }
        }
    }
}

#endif
