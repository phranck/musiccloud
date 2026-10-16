#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - ContentView

/// Root view for the iOS app. Uses NavigationStack on iPhone and NavigationSplitView on iPad.
///
/// It also opens the conversion sheet over both when the clipboard check
/// finds a streaming URL.
struct ContentView: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(ClipboardMonitor.self) private var monitor
    @Environment(HistoryManager.self) private var historyManager

    var body: some View {
        Group {
            if sizeClass == .regular {
                IPadSplitView()
            } else {
                IPhoneTabView()
            }
        }
        .symbolRenderingMode(.hierarchical)
        .clipboardConversionSheet(monitor: monitor, historyManager: historyManager)
    }
}

// MARK: - Clipboard Conversion Sheet

extension View {
    /// Opens the ``ConversionSheet`` whenever the clipboard check begins a conversion.
    ///
    /// The monitor checks the clipboard while the app is active, starting
    /// when it becomes active, so the sheet comes up when the app finds a
    /// streaming URL there. A URL handed over through the paste button, a
    /// drop or a `musiccloud://` link shows its result on the Home screen
    /// instead. A conversion cancelled by leaving for the background returns
    /// the monitor to `.idle`, which closes the sheet; the next check picks
    /// the URL up again and opens it anew.
    ///
    /// - Parameters:
    ///   - monitor: The monitor whose clipboard conversions the sheet follows.
    ///   - historyManager: Finds the converted entry the result shows.
    func clipboardConversionSheet(monitor: ClipboardMonitor, historyManager: HistoryManager) -> some View {
        modifier(ClipboardConversionSheetModifier(monitor: monitor, historyManager: historyManager))
    }
}

/// Decides when the conversion sheet opens and closes, and which phase it
/// shows; see ``SwiftUICore/View/clipboardConversionSheet(monitor:historyManager:)``.
private struct ClipboardConversionSheetModifier: ViewModifier {
    let monitor: ClipboardMonitor
    let historyManager: HistoryManager

    @State private var isPresented = false

    func body(content: Content) -> some View {
        content
            // Only a start opens the sheet, so one the user closed while the
            // URL converted stays closed when the result arrives.
            .onChange(of: monitor.conversionCount) {
                if monitor.origin == .clipboard {
                    isPresented = true
                }
            }
            .onChange(of: monitor.status) {
                if monitor.status == .idle {
                    isPresented = false
                }
            }
            .sheet(isPresented: $isPresented) {
                ClipboardConversionSheetContent(monitor: monitor, historyManager: historyManager) {
                    isPresented = false
                }
            }
    }
}

/// The ``ConversionSheet`` in the phase of the monitor's status. It reads the
/// status in its own body, so the sheet follows every change of it.
private struct ClipboardConversionSheetContent: View {
    let monitor: ClipboardMonitor
    let historyManager: HistoryManager
    /// Closes the sheet.
    let onClose: () -> Void

    var body: some View {
        ConversionSheet(phase: phase, onClose: onClose)
    }

    /// The monitor's status as the sheet shows it.
    private var phase: ConversionPhase {
        switch monitor.status {
        case .idle, .processing:
            return .converting
        case .success(let shortUrl, _):
            guard let entry = historyManager.entry(forShortUrl: shortUrl) else { return .failed(message: nil) }
            return .finished(entry)
        case .error(let error):
            return .failed(message: error.errorDescription)
        }
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
                OutlinedLogoText(size: 25)
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
            // Settings pushes the Social Media screen, which needs a stack of its own in the detail column.
            NavigationStack {
                SettingsView()
            }
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
