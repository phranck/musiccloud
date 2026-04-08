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
    @State private var filter: MediaFilter
    @State private var showSettings = false

    init(initialFilter: MediaFilter = .all) {
        _filter = State(initialValue: initialFilter)
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
        .navigationTitle(Bundle.main.appName)
        .searchable(text: $searchText, prompt: "Search conversions")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                HStack(spacing: 12) {
                    Menu {
                        Picker("Filter", selection: $filter) {
                            ForEach(MediaFilter.allCases) { item in
                                Text(item.title).tag(item)
                            }
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gear")
                    }
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            NavigationStack {
                SettingsView()
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Done") {
                                showSettings = false
                            }
                        }
                    }
            }
        }
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
