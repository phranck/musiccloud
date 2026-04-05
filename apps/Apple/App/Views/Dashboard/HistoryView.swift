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
    @State private var displayMode: DisplayMode = .list
    @State private var searchText = ""
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
                info.name.localizedCaseInsensitiveContains(searchText) ||
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
                switch displayMode {
                case .list: listView
                case .grid: gridView
                }
            }
        }
        .navigationTitle(filter.title)
        .searchable(text: $searchText, prompt: String(localized: "Search"))
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Picker("", selection: $displayMode) {
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
        case .album(let info):  info.name
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
        case .track(let info):  info.formattedDuration
        case .album(let info):  info.totalTracks.map { "\($0) tracks" }
        case .artist(let info): info.formattedFollowers
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
        case .album(let info):  info.name
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
