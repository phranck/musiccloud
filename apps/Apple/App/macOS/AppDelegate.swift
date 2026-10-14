//
//  AppDelegate.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

#if os(macOS)
import AppKit
import SwiftData
import SwiftUI

/// Manages the menu bar status item and popup panel.
///
/// Replaces SwiftUI's `MenuBarExtra` with a manual `NSStatusItem` + `NSPanel`
/// approach to enable custom icon animations during URL resolution.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var panel: NSPanel!
    private var dashboardWindow: NSWindow?
    private var settingsWindow: NSWindow?
    private var templateEditorWindow: NSWindow?
    private var iconHostingView: NSHostingView<MenuBarIcon>!
    private var eventMonitor: Any?

    static private(set) var shared: AppDelegate!

    let modelContainer: ModelContainer = {
        do {
            let container = try SharedStoreConfiguration.makeContainer()
            AppLogger.history.debug("SwiftData store: \(container.configurations.first?.url.path ?? "unknown")")
            return container
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }()

    private(set) var mainContext: ModelContext!
    private(set) var historyManager: HistoryManager!
    private(set) var monitor: ClipboardMonitor!
    /// The post templates, edited in Settings and used by the post composer.
    let templateStore = PostTemplateStore()

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        mainContext = modelContainer.mainContext
        historyManager = HistoryManager(modelContext: mainContext)
        monitor = ClipboardMonitor(historyManager: historyManager)
        setupStatusItem()
        setupPanel()
        setupEventMonitor()
        NSApplication.shared.registerForRemoteNotifications()
        NotificationManager.requestPermission()
        NotificationManager.cleanupAttachmentCache()
        Task { await TelemetryClient.shared.flushPending() }
        Task { await AppSession.shared.prepare() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }
}

// MARK: - Status Item

private extension AppDelegate {
    func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        guard let button = statusItem.button else { return }

        iconHostingView = NSHostingView(rootView: MenuBarIcon(isProcessing: false))
        iconHostingView.frame = button.bounds
        iconHostingView.autoresizingMask = [.width, .height]
        button.addSubview(iconHostingView)

        button.action = #selector(togglePanel)
        button.target = self

        startObservingStatus()
    }

    /// Mirrors `monitor.status.isProcessing` into the menu bar icon.
    ///
    /// `withObservationTracking` fires `onChange` once, before the new value is
    /// stored, so the icon is updated on the next main actor turn and tracking
    /// is re-armed from there.
    func startObservingStatus() {
        withObservationTracking {
            _ = monitor.status.isProcessing
        } onChange: { [weak self] in
            Task { @MainActor in
                guard let self else { return }
                self.iconHostingView.rootView = MenuBarIcon(isProcessing: self.monitor.status.isProcessing)
                self.startObservingStatus()
            }
        }
    }
}

// MARK: - Panel

private extension AppDelegate {
    func setupPanel() {
        panel = MenuBarPanel(
            contentRect: NSRect(x: 0, y: 0, width: PanelMetrics.panelWidth, height: PanelMetrics.minimumPanelHeight),
            styleMask: [.nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .popUpMenu
        panel.isOpaque = false
        panel.backgroundColor = .clear
        // Like Control Center, the cards float without a window shadow, which
        // the window server would otherwise cast around every card's outline.
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.animationBehavior = .utilityWindow

        let rootView = MenuBarView()
            .environment(\.modelContext, mainContext)
            .environment(monitor)
            .symbolRenderingMode(.hierarchical)

        panel.contentViewController = NSHostingController(rootView: rootView)
    }

    @objc func togglePanel() {
        if panel.isVisible {
            closePanel()
        } else {
            openPanel()
        }
    }

    func openPanel() {
        guard let buttonFrame = statusItem.button?.window?.frame else { return }

        // The window is larger than the cards by `shadowMargin` on every side,
        // so it is shifted up by that margin to keep the cards right below
        // the menu bar. The transparent margin lets clicks through.
        let margin = PanelMetrics.shadowMargin
        let fittingSize = panel.contentView?.fittingSize ?? .zero
        let contentSize = CGSize(
            width: max(fittingSize.width, PanelMetrics.panelWidth + margin * 2),
            height: max(fittingSize.height, PanelMetrics.minimumPanelHeight + margin * 2)
        )
        let panelRect = NSRect(
            x: buttonFrame.midX - contentSize.width / 2,
            y: buttonFrame.minY - contentSize.height + margin,
            width: contentSize.width,
            height: contentSize.height
        )
        panel.setFrame(panelRect, display: true)
        panel.contentView?.layoutSubtreeIfNeeded()
        panel.alphaValue = 0
        panel.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.23
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = 1
        }
    }

    func closePanel() {
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.23
            context.timingFunction = CAMediaTimingFunction(name: .easeIn)
            panel.animator().alphaValue = 0
        }, completionHandler: {
            MainActor.assumeIsolated { [weak self] in
                self?.panel.orderOut(nil)
                self?.panel.alphaValue = 1
            }
        })
    }
}

// MARK: - Window Management

extension AppDelegate {
    /// Opens the dashboard window, creating it if needed.
    func openDashboard() {
        let rootView = DashboardView()
            .environment(\.modelContext, mainContext)
            .environment(historyManager)
            .environment(monitor)
            .symbolRenderingMode(.hierarchical)

        dashboardWindow = showWindow(
            &dashboardWindow,
            rootView: rootView,
            config: WindowConfig(
                size: CGSize(width: 1000, height: 700),
                autosaveName: "DashboardWindow",
                title: Bundle.main.appName,
                titleVisibility: .hidden
            )
        )
    }

    /// Opens the settings window, creating it if needed.
    func openSettings() {
        let rootView = SettingsView()
            .environment(historyManager)
            .environment(monitor)
            .environment(templateStore)
            .symbolRenderingMode(.hierarchical)

        // Per the HIG, a settings window has no minimize or zoom button: it
        // opens quickly again and sizes itself to its content. SwiftUI owns
        // the toolbar and the title, so the title follows the visible pane
        // and the sidebar reaches the top of the window.
        settingsWindow = showWindow(
            &settingsWindow,
            rootView: rootView,
            config: WindowConfig(
                size: SettingsView.contentSize,
                autosaveName: "SettingsWindow",
                styleMask: [.titled, .closable, .fullSizeContentView],
                bridgesToolbarAndTitle: true
            )
        )
    }

    /// Opens the Template Editor window, creating it if needed.
    ///
    /// It is resizable, so a long template has room, and SwiftUI owns its
    /// title and toolbar, so the title names the template being edited.
    ///
    /// - Parameter templateID: The template to show, or `nil` to keep the current one.
    func openTemplateEditor(selecting templateID: PostTemplate.ID? = nil) {
        if let templateID {
            templateStore.editorSelectionID = templateID
        }
        let rootView = TemplateEditorView()
            .environment(\.modelContext, mainContext)
            .environment(templateStore)
            .symbolRenderingMode(.hierarchical)

        templateEditorWindow = showWindow(
            &templateEditorWindow,
            rootView: rootView,
            config: WindowConfig(
                size: TemplateEditorView.initialSize,
                autosaveName: "TemplateEditorWindow",
                styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                bridgesToolbarAndTitle: true
            )
        )
    }
}

// MARK: - Window Helpers

private extension AppDelegate {
    struct WindowConfig {
        var size: CGSize
        var autosaveName: String
        var title: String?
        var titleVisibility: NSWindow.TitleVisibility = .visible
        var titlebarAppearsTransparent: Bool = false
        var styleMask: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable]
        /// Whether SwiftUI places its toolbar and navigation title in the window.
        var bridgesToolbarAndTitle: Bool = false
    }

    @discardableResult
    func showWindow<Content: View>(
        _ stored: inout NSWindow?,
        rootView: Content,
        config: WindowConfig
    ) -> NSWindow {
        if let window = stored {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate()
            DispatchQueue.main.async {
                window.makeKeyAndOrderFront(nil)
                NSApp.activate()
            }
            return window
        }

        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: config.size),
            styleMask: config.styleMask,
            backing: .buffered,
            defer: false
        )
        if let title = config.title { window.title = title }
        window.titleVisibility = config.titleVisibility
        window.titlebarAppearsTransparent = config.titlebarAppearsTransparent
        let isFixedSize = !config.styleMask.contains(.resizable)
        let hostingController = NSHostingController(rootView: rootView)
        if config.bridgesToolbarAndTitle {
            hostingController.sceneBridgingOptions = [.toolbars, .title]
        }
        // A fixed-size window keeps the size given here. By default the
        // hosting controller sizes the window to its content, which has no
        // size yet when it is installed, and the window shrinks to zero.
        // The saved position would then be restored onto an empty frame.
        if isFixedSize {
            hostingController.sizingOptions = []
        }
        window.contentViewController = hostingController
        window.isReleasedWhenClosed = false
        window.delegate = self
        if isFixedSize {
            window.setContentSize(config.size)
        }

        // A resizable window gets its saved frame back. A fixed-size window
        // only keeps its saved position, because a frame saved under an
        // earlier content size would bring that size back.
        window.setFrameAutosaveName(config.autosaveName)
        if isFixedSize, window.contentRect(forFrameRect: window.frame).size != config.size {
            let top = window.frame.maxY
            window.setContentSize(config.size)
            window.setFrameTopLeftPoint(NSPoint(x: window.frame.minX, y: top))
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate()

        // LSUIElement apps can lose focus between panel close and window open.
        // Re-assert key window status on the next run-loop tick to guarantee
        // the window is key across the entire desktop.
        DispatchQueue.main.async {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate()
        }

        return window
    }
}

// MARK: - Window Lifecycle

extension AppDelegate: NSWindowDelegate {
    /// Lets a closed window go, together with the views it hosts.
    ///
    /// A closed window that stays referenced keeps its whole SwiftUI tree
    /// alive, including the history query that refreshes on every change and
    /// the artwork it has decoded. Opening the window again builds a new one,
    /// and the autosave name puts it back where it was.
    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        if window === dashboardWindow { dashboardWindow = nil }
        if window === settingsWindow { settingsWindow = nil }
        if window === templateEditorWindow { templateEditorWindow = nil }
        window.contentViewController = nil
    }
}

// MARK: - Event Monitor

private extension AppDelegate {
    func setupEventMonitor() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self, self.panel.isVisible else { return }

            // Ignore clicks on the status item button (togglePanel handles those)
            if let buttonWindow = self.statusItem.button?.window,
               buttonWindow == event.window {
                return
            }

            // Ignore clicks inside the panel itself
            if self.panel == event.window {
                return
            }

            self.closePanel()
        }
    }
}

// MARK: - MenuBarPanel

/// NSPanel subclass that allows becoming key window.
///
/// Required for `.nonactivatingPanel` style panels to accept key status
/// after being dismissed and reopened.
private final class MenuBarPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}
#endif
