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
struct HistoryView: View {
    @Environment(\.modelContext) private var modelContext

    let filter: SidebarItem

    private static let pageSize = 50

    @State private var allEntries: [MediaEntry] = []
    @AppStorage private var displayModeRaw: String
    @State private var searchText = ""

    init(filter: SidebarItem) {
        self.filter = filter
        _displayModeRaw = AppStorage(wrappedValue: DisplayMode.list.rawValue, "displayMode.\(filter.rawValue)")
    }

    private var displayMode: Binding<DisplayMode> {
        Binding(
            get: { DisplayMode(rawValue: displayModeRaw) ?? .list },
            set: { displayModeRaw = $0.rawValue }
        )
    }
    @State private var loadedCount = HistoryView.pageSize
    @State private var hasMore = true

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
        Group {
            if filteredEntries.isEmpty {
                emptyState
            } else {
                switch displayMode.wrappedValue {
                case .list: listView
                case .grid: gridView
                }
            }
        }
        .navigationTitle(filter.title)
        .searchable(text: $searchText, prompt: String(localized: "Search"))
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Picker("", selection: displayMode) {
                    ForEach(DisplayMode.allCases, id: \.self) { mode in
                        Image(systemName: mode.icon)
                            .tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .help(String(localized: "Display Mode"))
            }
        }
        .onAppear { fetchEntries() }
        .onReceive(NotificationCenter.default.publisher(for: .historyDidChange)) { _ in
            fetchEntries()
        }
    }
}

// MARK: - Display Mode

extension HistoryView {
    enum DisplayMode: String, CaseIterable {
        case list
        case grid

        var icon: String {
            switch self {
            case .list: "list.bullet"
            case .grid: "square.grid.2x2"
            }
        }
    }
}

// MARK: - List View

private extension HistoryView {
    var listView: some View {
        List(filteredEntries) { entry in
            HistoryListRow(entry: entry)
                .entryActions(entry: entry, onDelete: { deleteEntry(entry) })
                .onAppear { loadMoreIfNeeded(entry) }
        }
        .listStyle(.inset(alternatesRowBackgrounds: true))
    }
}

// MARK: - Grid View

private extension HistoryView {
    var gridView: some View {
        ScrollView {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 180, maximum: 220), spacing: 16)],
                spacing: 16
            ) {
                ForEach(filteredEntries) { entry in
                    HistoryGridCard(entry: entry)
                        .entryActions(entry: entry, onDelete: { deleteEntry(entry) })
                        .onAppear { loadMoreIfNeeded(entry) }
                }
            }
            .padding(20)
        }
    }
}

// MARK: - Empty State

private extension HistoryView {
    var emptyState: some View {
        ContentUnavailableView {
            Label(filter.emptyTitle, systemImage: filter.icon)
        } description: {
            Text(filter.emptyDescription)
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
        let results = (try? modelContext.fetch(descriptor)) ?? []
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

// MARK: - List Row

private struct HistoryListRow: View {
    let entry: MediaEntry

    var body: some View {
        HStack(spacing: 12) {
            artwork
            metadata
            Spacer(minLength: 8)
            trailing
            ShareButton(shortUrl: entry.shortUrl)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var artwork: some View {
        MediaArtwork(url: artworkUrl)
    }

    @ViewBuilder
    private var metadata: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.body)
                .fontWeight(.medium)
                .lineLimit(1)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    @ViewBuilder
    private var trailing: some View {
        if let detail = trailingDetail {
            Text(detail)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(.tertiary)
        }
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

    private var trailingDetail: String? {
        switch entry.contentType {
        case .track(let info):
            [info.releaseYear, info.formattedDuration].compactMap { $0 }.joined(separator: " · ").nilIfEmpty
        case .album(let info):
            [info.releaseYear, info.totalTracks.map { "\($0) tracks" }].compactMap { $0 }.joined(separator: " · ").nilIfEmpty
        case .artist(let info):
            info.formattedFollowers
        }
    }
}

// MARK: - Grid Card

private struct HistoryGridCard: View {
    let entry: MediaEntry

    @State private var isHovered = false

    var body: some View {
        VStack(spacing: 0) {
            gridArtwork
            cardInfo
        }
        .background(.regularMaterial)
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
        .frame(height: 180)
        .clipped()
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
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.headline)
                .lineLimit(1)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
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
                if let url = URL(string: entry.shortUrl) {
                    NSWorkspace.shared.open(url)
                }
            }
            .contextMenu {
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(entry.shortUrl, forType: .string)
                } label: {
                    Label("Copy Share URL", systemImage: "doc.on.doc")
                }

                Button {
                    if let url = URL(string: entry.shortUrl) {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    Label("Open in Browser...", systemImage: "safari")
                }

                if entry.mediaType != "artist", !entry.serviceLinks.isEmpty {
                    Menu {
                        ForEach(entry.serviceLinks, id: \.service) { link in
                            Button {
                                if let url = URL(string: link.url) {
                                    NSWorkspace.shared.open(url)
                                }
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
        return NSImage(systemSymbolName: "music.note", accessibilityDescription: service)!
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

// MARK: - SidebarItem Empty State Helpers

private extension SidebarItem {
    var emptyTitle: String {
        switch self {
        case .tracks:  String(localized: "No Tracks")
        case .albums:  String(localized: "No Albums")
        case .artists: String(localized: "No Artists")
        }
    }

    var emptyDescription: String {
        switch self {
        case .tracks:  String(localized: "Resolved tracks will appear here.")
        case .albums:  String(localized: "Resolved albums will appear here.")
        case .artists: String(localized: "Resolved artists will appear here.")
        }
    }
}
