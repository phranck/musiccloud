import SwiftUI

/// The main entry point for the musiccloud application.
///
/// `MusicCloudApp` initializes the core services (history management and clipboard monitoring)
/// and presents the appropriate UI for the platform:
/// - **macOS**: Menu bar extra with dropdown interface
/// - **iOS**: Full window-based interface
///
/// ## Architecture
///
/// The app uses SwiftUI's environment system to share state:
/// - ``HistoryManager``: Manages conversion history with iCloud sync
/// - ``ClipboardMonitor``: Monitors clipboard for streaming URLs
///
/// Both services are initialized once and shared throughout the view hierarchy.
///
/// ## Usage
///
/// This struct is marked with `@main`, making it the application's entry point.
/// No manual instantiation is needed - SwiftUI handles this automatically.
///
/// ## Topics
///
/// ### App Entry
/// - ``init()``
/// - ``body``
///
/// ### State
/// - ``historyManager``
/// - ``monitor``
@main
struct MusicCloudApp: App {
    
    /// Shared history manager instance
    @State private var historyManager: HistoryManager
    
    /// Shared clipboard monitor instance
    @State private var monitor: ClipboardMonitor

    /// Initializes the app and its core services.
    ///
    /// Creates a ``HistoryManager`` and ``ClipboardMonitor``, ensuring the
    /// clipboard monitor has access to the history manager for storing conversions.
    ///
    /// The initialization order is important:
    /// 1. Create ``HistoryManager`` (loads existing history from iCloud)
    /// 2. Create ``ClipboardMonitor`` with reference to history manager
    /// 3. Wrap both in `@State` for SwiftUI lifecycle management
    init() {
        let history = HistoryManager()
        _historyManager = State(initialValue: history)
        _monitor = State(initialValue: ClipboardMonitor(historyManager: history))
    }

    // MARK: - Scene
    
    var body: some Scene {
#if os(macOS)
        MenuBarExtra {
            MenuBarView()
                .environment(historyManager)
                .environment(monitor)
        } label: {
            MenuBarIcon(isProcessing: monitor.status.isProcessing)
        }
        .menuBarExtraStyle(.window)
#else
        WindowGroup {
            ContentView()
                .environment(historyManager)
                .environment(monitor)
        }
#endif
    }
}

