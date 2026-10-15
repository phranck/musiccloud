#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - ContentView

/// Root view for the iOS app. Uses NavigationStack on iPhone and NavigationSplitView on iPad.
struct ContentView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        Group {
            if sizeClass == .regular {
                IPadSplitView()
            } else {
                IPhoneTabView()
            }
        }
        .symbolRenderingMode(.hierarchical)
    }
}

// MARK: - IPhoneTabView

/// iPhone-specific tab view with filter tabs and settings.
private struct IPhoneTabView: View {
    @Environment(ClipboardMonitor.self) private var monitor

    @State private var selectedTab: TabID = .filter(.all)

    var body: some View {
        TabView(selection: $selectedTab) {
            ForEach(MediaFilter.allCases) { filter in
                Tab(filter.title, systemImage: filter.icon, value: TabID.filter(filter)) {
                    NavigationStack {
                        HistoryView(initialFilter: filter)
                    }
                }
            }

            Tab("Settings", systemImage: "gear", value: TabID.settings) {
                NavigationStack {
                    SettingsView()
                        .navigationTitle("Settings")
                }
            }
        }
        .followsConversions(of: monitor, filter: selectedFilter)
    }

    /// Identifies a tab for the selection. Named apart from `SwiftUI.Tab`,
    /// which builds the tabs.
    private enum TabID: Hashable {
        case filter(MediaFilter)
        case settings
    }

    /// The selected tab seen as a filter, so a conversion can switch it.
    private var selectedFilter: Binding<MediaFilter> {
        Binding(
            get: {
                if case .filter(let filter) = selectedTab { return filter }
                return .all
            },
            set: { selectedTab = .filter($0) }
        )
    }
}

// MARK: - IPadSplitView

/// iPad-specific split view with sidebar navigation.
private struct IPadSplitView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Query(sort: \MediaEntry.date, order: .reverse) private var allEntries: [MediaEntry]
    @State private var selection: SidebarSelection? = .home
    @State private var isDropTargeted = false

    var body: some View {
        NavigationSplitView {
            IPadSidebar(selection: $selection, allEntries: allEntries)
        } detail: {
            IPadDetail(selection: selection)
        }
        .dropDestination(for: URL.self) { urls, _ in
            handleDrop(urls.first?.absoluteString)
        } isTargeted: { targeted in
            isDropTargeted = targeted
        }
        .dropDestination(for: String.self) { strings, _ in
            handleDrop(strings.first)
        } isTargeted: { targeted in
            if !isDropTargeted { isDropTargeted = targeted }
        }
        .overlay {
            if isDropTargeted {
                DropOverlay()
            }
        }
    }

    private func handleDrop(_ urlString: String?) -> Bool {
        guard let urlString, StreamingServices.isStreamingURL(urlString) else { return false }
        monitor.convert(url: urlString)
        selection = .home
        return true
    }
}

// MARK: - SidebarSelection

private enum SidebarSelection: Hashable {
    case home
    case filter(MediaFilter)
    case settings
}

// MARK: - IPadSidebar

private struct IPadSidebar: View {
    @Binding var selection: SidebarSelection?
    let allEntries: [MediaEntry]

    var body: some View {
        List(selection: $selection) {
            Section {
                Label("Home", systemImage: "house")
                    .tag(SidebarSelection.home)
            }
            Section("Library") {
                ForEach(MediaFilter.mediaOnlyCases) { filter in
                    HStack {
                        Label(filter.title, systemImage: filter.icon)
                        Spacer()
                        Text("\(count(of: filter))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .tag(SidebarSelection.filter(filter))
                }
            }
            Section {
                Label("Settings", systemImage: "gear")
                    .tag(SidebarSelection.settings)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                LogoText(size: 25)
            }
        }
    }

    private func count(of filter: MediaFilter) -> Int {
        filter.filtered(allEntries, searchText: "").count
    }
}

// MARK: - IPadDetail

private struct IPadDetail: View {
    let selection: SidebarSelection?

    var body: some View {
        switch selection {
        case .home:
            HomeView()
        case .filter(let filter):
            HistoryView(initialFilter: filter)
        case .settings:
            SettingsView()
        case nil:
            HomeView()
        }
    }
}

// MARK: - DropOverlay

private struct DropOverlay: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 20)
            .strokeBorder(.tint, lineWidth: 3)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(.tint.opacity(0.1))
            )
            .overlay {
                VStack(spacing: 8) {
                    Image(systemName: "arrow.down.doc.fill")
                        .font(.largeTitle)
                        .foregroundStyle(.tint)
                    Text("Drop streaming URL")
                        .font(.headline)
                        .foregroundStyle(.tint)
                }
            }
            .padding()
            .allowsHitTesting(false)
    }
}

#endif
