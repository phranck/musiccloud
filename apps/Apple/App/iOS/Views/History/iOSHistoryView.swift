#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - HistoryView

/// Grid-based history view with search, filter, and context menus.
struct HistoryView: View {
    @Environment(HistoryManager.self) private var historyManager
    @Query(sort: \MediaEntry.date, order: .reverse, animation: .default)
    private var allEntries: [MediaEntry]
    @State private var searchText = ""
    private let filter: MediaFilter

    init(initialFilter: MediaFilter = .all) {
        filter = initialFilter
    }

    private var filteredEntries: [MediaEntry] {
        filter.filtered(allEntries, searchText: searchText)
    }

    var body: some View {
        Group {
            if filteredEntries.isEmpty {
                HistoryEmptyState(filter: filter, searchText: searchText)
            } else {
                HistoryGrid(entries: filteredEntries, historyManager: historyManager)
            }
        }
        .animation(.smooth, value: allEntries.count)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                LogoText(size: 25)
            }
        }
        .searchable(text: $searchText, prompt: "Search conversions")
    }
}

// MARK: - HistoryGrid

private struct HistoryGrid: View {
    let entries: [MediaEntry]
    let historyManager: HistoryManager

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 16)], spacing: 16) {
                ForEach(entries) { entry in
                    HistoryGridCard(entry: entry)
                        .contentShape(RoundedRectangle(cornerRadius: 12))
                        .entryActions(entry: entry, onDelete: { historyManager.remove(entry) })
                }
            }
            .padding()
        }
    }
}

// MARK: - HistoryEmptyState

private struct HistoryEmptyState: View {
    let filter: MediaFilter
    let searchText: String

    var body: some View {
        ContentUnavailableView {
            Label(filter.emptyTitle, systemImage: searchText.isEmpty ? filter.icon : "magnifyingglass")
        } description: {
            Text(searchText.isEmpty ? filter.emptyDescription : "Try a different search term")
        }
    }
}

#endif
