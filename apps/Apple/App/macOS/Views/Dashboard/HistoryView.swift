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

    @Binding var filter: SidebarItem

    @State private var searchText = ""
    @AppStorage("gridItemSize") private var gridItemSize: Double = 168

    private static let gridItemMinSize: CGFloat = 150

    private var filteredEntries: [MediaEntry] {
        let byType = allEntries.filter { $0.mediaType == filter.mediaType }

        guard !searchText.isEmpty else { return byType }

        return byType.filter { entry in
            let query = searchText.lowercased()
            return entry.contentType.title.localizedCaseInsensitiveContains(query) ||
                entry.contentType.subtitle.localizedCaseInsensitiveContains(query)
        }
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

            Divider()
            bottomBar
        }
        .searchable(text: $searchText, placement: .toolbar, prompt: String(localized: "Search"))
        .background(WindowKeyMonitor())
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("", selection: $filter) {
                    ForEach(SidebarItem.allCases, id: \.self) { item in
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

// MARK: - Entry Actions

private struct EntryActionsModifier: ViewModifier {
    let entry: MediaEntry
    let onDelete: () -> Void

    func body(content: Content) -> some View {
        content
            .onTapGesture(count: 2) {
                guard let url = URL(string: entry.shortUrl) else {
                    AppLogger.ui.error("Invalid short URL: \(entry.shortUrl)")
                    return
                }
                NSWorkspace.shared.open(url)
            }
            .contextMenu {
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(entry.shortUrl, forType: .string)
                } label: {
                    Label("Copy Share URL", systemImage: "doc.on.doc")
                }

                Button {
                    guard let url = URL(string: entry.shortUrl) else {
                        AppLogger.ui.error("Invalid short URL: \(entry.shortUrl)")
                        return
                    }
                    NSWorkspace.shared.open(url)
                } label: {
                    Label("Open in Browser...", systemImage: "safari")
                }

                if entry.mediaType != .artist, !entry.serviceLinks.isEmpty {
                    Menu {
                        ForEach(entry.serviceLinks, id: \.service) { link in
                            Button {
                                guard let url = URL(string: link.url) else {
                                    AppLogger.ui.error("Invalid service URL: \(link.url)")
                                    return
                                }
                                NSWorkspace.shared.open(url)
                            } label: {
                                Label {
                                    Text(link.displayName)
                                } icon: {
                                    Image(nsImage: serviceIcon(for: link.service))
                                }
                            }
                        }
                    } label: {
                        Label("Open in", systemImage: "arrow.up.forward.app")
                    }
                }

                Divider()

                Button(role: .destructive) {
                    onDelete()
                } label: {
                    Label("Delete Entry", systemImage: "trash")
                }
            }
    }
}

private extension View {
    func entryActions(entry: MediaEntry, onDelete: @escaping () -> Void) -> some View {
        modifier(EntryActionsModifier(entry: entry, onDelete: onDelete))
    }
}

// MARK: - Service Icon Helper

private func serviceIcon(for service: String) -> NSImage {
    let canvasSize = NSSize(width: 16, height: 16)
    guard let original = NSImage(named: "ServiceIcons/\(service)") else {
        return NSImage(systemSymbolName: "music.note", accessibilityDescription: service) ?? NSImage()
    }
    let originalSize = original.size
    let scale = min(canvasSize.width / originalSize.width, canvasSize.height / originalSize.height)
    let scaledSize = NSSize(width: originalSize.width * scale, height: originalSize.height * scale)
    let origin = NSPoint(
        x: (canvasSize.width - scaledSize.width) / 2,
        y: (canvasSize.height - scaledSize.height) / 2
    )
    let resized = NSImage(size: canvasSize, flipped: false) { _ in
        original.draw(in: NSRect(origin: origin, size: scaledSize))
        return true
    }
    resized.isTemplate = true
    return resized
}

#endif
