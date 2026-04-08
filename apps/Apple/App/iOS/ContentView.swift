#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - ContentView

/// Root view for the iOS app. Uses NavigationStack on iPhone and NavigationSplitView on iPad.
struct ContentView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        if sizeClass == .regular {
            IPadSplitView()
        } else {
            NavigationStack {
                HistoryView()
            }
        }
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
        Task { await monitor.resolve(url: urlString) }
        selection = .home
        return true
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

    private func countFor(_ mediaType: MediaType) -> Int {
        allEntries.filter { $0.mediaType == mediaType }.count
    }
}

// MARK: - IPadDetail

private struct IPadDetail: View {
    let selection: SidebarSelection?

    var body: some View {
        switch selection {
        case .home:
            HomeView()
        case .tracks:
            HistoryView(initialFilter: .tracks)
        case .albums:
            HistoryView(initialFilter: .albums)
        case .artists:
            HistoryView(initialFilter: .artists)
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
