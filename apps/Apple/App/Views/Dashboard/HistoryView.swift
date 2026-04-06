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
/// Supports list and grid display modes with search filtering.
/// The filter is controlled via a centered `AnimatedSegmentControl` in the toolbar.
struct HistoryView: View {
    @Environment(\.modelContext) private var modelContext

    @Binding var filter: SidebarItem

    private static let pageSize = 50

    @State private var allEntries: [MediaEntry] = []
    @State private var searchText = ""
    @State private var loadedCount = HistoryView.pageSize
    @State private var hasMore = true
    @AppStorage("gridItemSize") private var gridItemSize: Double = 168

    private static let gridItemMinSize: CGFloat = 150

    private var filteredEntries: [MediaEntry] {
        let mediaType = filter.mediaType
        let byType = allEntries.filter { $0.mediaType == mediaType }

        guard !searchText.isEmpty else { return byType }

        return byType.filter { entry in
            switch entry.contentType {
            case .track(let info):
                info.title.localizedCaseInsensitiveContains(searchText) ||
                info.artistsString.localizedCaseInsensitiveContains(searchText)
            case .album(let info):
                info.title.localizedCaseInsensitiveContains(searchText) ||
                info.artistsString.localizedCaseInsensitiveContains(searchText)
            case .artist(let info):
                info.name.localizedCaseInsensitiveContains(searchText)
            }
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
        .onAppear { fetchEntries() }
        .onChange(of: filter) {
            loadedCount = HistoryView.pageSize
            loadEntries()
        }
        .onReceive(NotificationCenter.default.publisher(for: .historyDidChange)) { _ in
            fetchEntries()
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
                        .entryActions(entry: entry, onDelete: { deleteEntry(entry) })
                        .onAppear { loadMoreIfNeeded(entry) }
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

// MARK: - Fetch

private extension HistoryView {
    func fetchEntries() {
        loadedCount = HistoryView.pageSize
        loadEntries()
    }

    func loadEntries() {
        var descriptor = FetchDescriptor<MediaEntry>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        descriptor.fetchLimit = loadedCount
        let results: [MediaEntry]
        do {
            results = try modelContext.fetch(descriptor)
        } catch {
            AppLogger.history.error("Failed to fetch entries: \(error.localizedDescription)")
            results = []
        }
        hasMore = results.count >= loadedCount
        allEntries = results
    }

    func loadMoreIfNeeded(_ entry: MediaEntry) {
        guard hasMore, entry.id == filteredEntries.last?.id else { return }
        loadedCount += HistoryView.pageSize
        loadEntries()
    }

    func deleteEntry(_ entry: MediaEntry) {
        modelContext.delete(entry)
        try? modelContext.save()
        fetchEntries()
        NotificationCenter.default.post(name: .historyDidChange, object: nil)
    }
}

// MARK: - Grid Card

private struct HistoryGridCard: View {
    let entry: MediaEntry

    @State private var isHovered = false

    var body: some View {
        gridArtwork
            .overlay(alignment: .bottom) { cardInfo }
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(isHovered ? 0.2 : 0.08), radius: isHovered ? 12 : 6, y: isHovered ? 4 : 2)
            .scaleEffect(isHovered ? 1.02 : 1.0)
            .animation(.easeOut(duration: 0.15), value: isHovered)
            .onHover { isHovered = $0 }
    }

    @ViewBuilder
    private var gridArtwork: some View {
        Group {
            if let urlString = artworkUrl, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        artworkPlaceholder
                    }
                }
            } else {
                artworkPlaceholder
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var artworkPlaceholder: some View {
        Rectangle()
            .fill(.quaternary)
            .overlay {
                Image(systemName: placeholderIcon)
                    .font(.system(size: 40))
                    .foregroundStyle(.tertiary)
            }
    }

    private var cardInfo: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(subtitle)
                .font(.headline)
                .lineLimit(1)
            Text(title)
                .font(.subheadline)
                .lineLimit(1)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            LinearGradient(
                colors: [.black.opacity(0.85), .clear],
                startPoint: .bottom,
                endPoint: .top
            )
        )
    }

    private var title: String {
        switch entry.contentType {
        case .track(let info):  info.title
        case .album(let info):  info.title
        case .artist(let info): info.name
        }
    }

    private var subtitle: String {
        switch entry.contentType {
        case .track(let info):  info.artistsString
        case .album(let info):  info.artistsString
        case .artist(let info): info.genresString ?? "Artist"
        }
    }

    private var artworkUrl: String? {
        switch entry.contentType {
        case .track(let info):  info.artworkUrl
        case .album(let info):  info.artworkUrl
        case .artist(let info): info.artworkUrl
        }
    }

    private var placeholderIcon: String {
        switch entry.contentType {
        case .track:  "music.note"
        case .album:  "square.stack"
        case .artist: "person.circle"
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

                if entry.mediaType != "artist", !entry.serviceLinks.isEmpty {
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

// MARK: - String Helpers

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

// MARK: - Window Key Monitor

/// Installs a local key-event monitor for Cmd+F (focus search) and Escape (close window).
///
/// The toolbar search field lives outside `contentView`, so we search from the
/// window's theme frame (`contentView.superview`) which contains both content and toolbar.
private struct WindowKeyMonitor: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        context.coordinator.monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            guard let window = view.window else { return event }

            if event.keyCode == 53 { // Escape
                window.close()
                return nil
            }

            if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "f" {
                // Search from theme frame to include toolbar views
                let root = window.contentView?.superview ?? window.contentView
                if let searchField = root?.findFirst(NSSearchField.self) {
                    window.makeFirstResponder(searchField)
                    return nil
                }
            }

            return event
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var monitor: Any?
        deinit {
            if let monitor { NSEvent.removeMonitor(monitor) }
        }
    }
}

