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
        Settings {
            EmptyView()
        }
    }
#else
    @State private var historyManager: HistoryManager
    @State private var monitor: ClipboardMonitor

    init() {
        let history = HistoryManager()
        _historyManager = State(initialValue: history)
        _monitor = State(initialValue: ClipboardMonitor(historyManager: history))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(historyManager)
                .environment(monitor)
        }
    }
#endif
}
