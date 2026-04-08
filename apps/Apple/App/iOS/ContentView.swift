#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - ContentView

/// Root view for the iOS app. Uses TabView on iPhone and NavigationSplitView on iPad.
struct ContentView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        if sizeClass == .regular {
            iPadLayout
        } else {
            iPhoneLayout
        }
    }
}

// MARK: - iPhone Layout

private extension ContentView {
    var iPhoneLayout: some View {
        NavigationStack {
            HistoryView()
        }
    }
}

// MARK: - iPad Layout

private extension ContentView {
    var iPadLayout: some View {
        IPadSplitView()
    }
}

/// iPad-specific split view with sidebar navigation.
private struct IPadSplitView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Query(sort: \MediaEntry.date, order: .reverse) private var allEntries: [MediaEntry]
    @State private var selection: SidebarSelection? = .home
    @State private var isDropTargeted = false

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detail
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
                dropOverlay
            }
        }
    }
}

// MARK: - SidebarSelection

private enum SidebarSelection: Hashable {
    case home
    case tracks
    case albums
    case artists
    case settings
}

// MARK: - iPad Sidebar

private extension IPadSplitView {
    var sidebar: some View {
        List(selection: $selection) {
            Section {
                Label("Home", systemImage: "house")
                    .tag(SidebarSelection.home)
            }
            Section("Library") {
                HStack {
                    Label("Tracks", systemImage: "music.note")
                    Spacer()
                    Text("\(countFor(.track))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .tag(SidebarSelection.tracks)
                HStack {
                    Label("Albums", systemImage: "square.stack")
                    Spacer()
                    Text("\(countFor(.album))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .tag(SidebarSelection.albums)
                HStack {
                    Label("Artists", systemImage: "person.2")
                    Spacer()
                    Text("\(countFor(.artist))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .tag(SidebarSelection.artists)
            }
            Section {
                Label("Settings", systemImage: "gear")
                    .tag(SidebarSelection.settings)
            }
        }
        .navigationTitle(Bundle.main.appName)
    }

    func countFor(_ mediaType: MediaType) -> Int {
        allEntries.filter { $0.mediaType == mediaType }.count
    }
}

// MARK: - iPad Detail

private extension IPadSplitView {
    @ViewBuilder
    var detail: some View {
        switch selection {
        case .home:
            HomeView()
        case .tracks:
            FilteredHistoryView(filter: .tracks)
        case .albums:
            FilteredHistoryView(filter: .albums)
        case .artists:
            FilteredHistoryView(filter: .artists)
        case .settings:
            SettingsView()
        case nil:
            HomeView()
        }
    }
}

// MARK: - Drop Handling

private extension IPadSplitView {
    func handleDrop(_ urlString: String?) -> Bool {
        guard let urlString, StreamingServices.isStreamingURL(urlString) else { return false }
        Task { await monitor.resolve(url: urlString) }
        selection = .home
        return true
    }

    var dropOverlay: some View {
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

// MARK: - FilteredHistoryView

/// A wrapper that pre-selects a content type filter for the HistoryView.
private struct FilteredHistoryView: View {
    var filter: MediaFilter

    var body: some View {
        HistoryView(initialFilter: filter)
    }
}

#endif
