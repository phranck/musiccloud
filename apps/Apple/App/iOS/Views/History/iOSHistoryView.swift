#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - HistoryView

/// Grid-based history view with search, filter, and context menus.
struct HistoryView: View {
    @Environment(HistoryManager.self) private var historyManager
    @Environment(\.openURL) private var openURL
    @Query(sort: \MediaEntry.date, order: .reverse, animation: .default)
    private var allEntries: [MediaEntry]
    @State private var searchText = ""
    @State private var filter: ContentFilter

    init(initialFilter: ContentFilter = .all) {
        _filter = State(initialValue: initialFilter)
    }

    var body: some View {
        Group {
            if filteredEntries.isEmpty {
                emptyState
            } else {
                gridContent
            }
        }
        .navigationTitle("History")
        .searchable(text: $searchText, prompt: "Search conversions")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Filter", selection: $filter) {
                        ForEach(ContentFilter.allCases) { item in
                            Text(item.label).tag(item)
                        }
                    }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                }
            }
        }
    }
}

// MARK: - ContentFilter

extension HistoryView {
    enum ContentFilter: String, CaseIterable, Identifiable {
        case all, tracks, albums, artists

        var id: String { rawValue }

        var label: String {
            switch self {
            case .all: "All"
            case .tracks: "Tracks"
            case .albums: "Albums"
            case .artists: "Artists"
            }
        }
    }
}

// MARK: - Private API

private extension HistoryView {
    var filteredEntries: [MediaEntry] {
        allEntries.filter { entry in
            let matchesFilter: Bool = switch filter {
            case .all: true
            case .tracks: entry.mediaType == .track
            case .albums: entry.mediaType == .album
            case .artists: entry.mediaType == .artist
            }
            guard matchesFilter else { return false }
            guard !searchText.isEmpty else { return true }
            let query = searchText.lowercased()
            return entryTitle(entry).lowercased().contains(query)
                || entrySubtitle(entry).lowercased().contains(query)
        }
    }

    var gridContent: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                ForEach(filteredEntries) { entry in
                    HistoryGridCard(entry: entry)
                        .contextMenu {
                            Button {
                                UIPasteboard.general.string = entry.shortUrl
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            } label: {
                                Label("Copy Link", systemImage: "doc.on.doc")
                            }
                            ShareLink(item: entry.shortUrl) {
                                Label("Share", systemImage: "square.and.arrow.up")
                            }
                            if let url = URL(string: entry.shortUrl) {
                                Button {
                                    openURL(url)
                                } label: {
                                    Label("Open", systemImage: "safari")
                                }
                            }
                            Divider()
                            Button(role: .destructive) {
                                historyManager.remove(entry)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
            .padding()
        }
    }

    var emptyState: some View {
        ContentUnavailableView {
            Label(searchText.isEmpty ? "No Conversions Yet" : "No Results", systemImage: searchText.isEmpty ? "music.note.list" : "magnifyingglass")
        } description: {
            Text(searchText.isEmpty ? "Share a streaming link to get started" : "Try a different search term")
        }
    }

    func entryTitle(_ entry: MediaEntry) -> String {
        switch entry.contentType {
        case .track(let info): info.title
        case .album(let info): info.title
        case .artist(let info): info.name
        }
    }

    func entrySubtitle(_ entry: MediaEntry) -> String {
        switch entry.contentType {
        case .track(let info): info.artistsString
        case .album(let info): info.artistsString
        case .artist(let info): info.genresString ?? ""
        }
    }
}

#endif
