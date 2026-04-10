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
    private let modelContainer: ModelContainer?
    @State private var historyManager: HistoryManager?
    @State private var monitor: ClipboardMonitor?
    private let storeError: String?

    init() {
        do {
            let container = try SharedStoreConfiguration.makeContainer()
            modelContainer = container
            let history = HistoryManager(modelContext: container.mainContext)
            _historyManager = State(initialValue: history)
            _monitor = State(initialValue: ClipboardMonitor(historyManager: history))
            storeError = nil
        } catch {
            AppLogger.history.error("Failed to create ModelContainer: \(error)")
            modelContainer = nil
            _historyManager = State(initialValue: nil)
            _monitor = State(initialValue: nil)
            storeError = error.localizedDescription
        }
    }

    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            if let modelContainer, let historyManager, let monitor {
                ContentView()
                    .modelContainer(modelContainer)
                    .environment(historyManager)
                    .environment(monitor)
                    .onChange(of: scenePhase) { _, newPhase in
                        if newPhase == .active, ClipboardMonitor.isEnabled {
                            monitor.startMonitoring()
                        } else {
                            monitor.stopMonitoring()
                        }
                    }
                    .onOpenURL { url in
                        handleIncomingURL(url)
                    }
                    .task {
                        UIApplication.shared.registerForRemoteNotifications()
                    }
            } else {
                ContentUnavailableView(
                    "Database Error",
                    systemImage: "exclamationmark.triangle",
                    description: Text(storeError ?? "Unknown error")
                )
            }
        }
    }

    private func handleIncomingURL(_ url: URL) {
        guard url.scheme == "musiccloud",
              url.host == "resolve",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let urlParam = components.queryItems?.first(where: { $0.name == "url" })?.value else {
            return
        }
        Task { await monitor?.resolve(url: urlParam) }
    }

#endif
}
