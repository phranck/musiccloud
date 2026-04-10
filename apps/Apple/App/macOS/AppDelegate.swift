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

    func startObservingStatus() {
        func observe() {
            withObservationTracking {
                MainActor.assumeIsolated {
                    _ = self.monitor.status.isProcessing
                }
            } onChange: {
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    MainActor.assumeIsolated {
                        self.iconHostingView.rootView = MenuBarIcon(isProcessing: self.monitor.status.isProcessing)
                    }
                    observe()
                }
            }
        }
        observe()
    }
}

// MARK: - Panel

private extension AppDelegate {
    func setupPanel() {
        panel = MenuBarPanel(
            contentRect: NSRect(x: 0, y: 0, width: PanelMetrics.panelWidth, height: 280),
            styleMask: [.nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .popUpMenu
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
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

        let fittingSize = panel.contentView?.fittingSize ?? .zero
        let contentSize = CGSize(
            width: max(fittingSize.width, PanelMetrics.panelWidth),
            height: max(fittingSize.height, 280)
        )
        let panelRect = NSRect(
            x: buttonFrame.midX - contentSize.width / 2,
            y: buttonFrame.minY - contentSize.height,
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
            .symbolRenderingMode(.hierarchical)

        settingsWindow = showWindow(
            &settingsWindow,
            rootView: rootView,
            config: WindowConfig(
                size: CGSize(width: 640, height: 400),
                autosaveName: "SettingsWindow",
                titleVisibility: .hidden,
                styleMask: [.titled, .closable, .miniaturizable]
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
        window.contentViewController = NSHostingController(rootView: rootView)
        window.isReleasedWhenClosed = false

        // Set content size BEFORE autosave name so the restored frame
        // is not overwritten by the hardcoded size.
        if !config.styleMask.contains(.resizable) {
            window.setContentSize(config.size)
        }
        window.setFrameAutosaveName(config.autosaveName)

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
