import SwiftData
import SwiftUI

/// The main entry point for the musiccloud application.
///
/// `MusicCloudApp` initializes the core services and presents the appropriate UI:
/// - **macOS**: NSStatusItem with popup panel (via ``AppDelegate``)
/// - **iOS**: Full window-based interface
///
/// On macOS, all state is owned by ``AppDelegate``. The SwiftUI `App` struct
/// provides only a minimal `Settings` scene as required by the framework.
@main
struct MusicCloudApp: App {

#if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            EmptyView()
                .frame(width: 0, height: 0)
                .hidden()
        }
        .defaultSize(width: 0, height: 0)
        .defaultLaunchBehavior(.suppressed)
    }
#else
    private let modelContainer: ModelContainer
    @State private var historyManager: HistoryManager
    @State private var monitor: ClipboardMonitor

    init() {
        do {
            let config = ModelConfiguration(cloudKitDatabase: .automatic)
            let container = try ModelContainer(for: MediaEntry.self, configurations: config)
            modelContainer = container
            let history = HistoryManager(modelContext: container.mainContext)
            _historyManager = State(initialValue: history)
            _monitor = State(initialValue: ClipboardMonitor(historyManager: history))
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(modelContainer)
                .environment(historyManager)
                .environment(monitor)
                .symbolRenderingMode(.hierarchical)
        }
    }
#endif
}
