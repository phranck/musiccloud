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
final class AppDelegate: NSObject, NSApplicationDelegate, @unchecked Sendable {
    private var statusItem: NSStatusItem!
    private var panel: NSPanel!
    private var dashboardWindow: NSWindow?
    private var iconHostingView: NSHostingView<MenuBarIcon>!
    private var eventMonitor: Any?

    static private(set) var shared: AppDelegate!

    let modelContainer: ModelContainer = {
        guard let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            fatalError("Unable to access Application Support directory")
        }
        let storeDir = appSupport.appendingPathComponent("io.musiccloud", isDirectory: true)

        do {
            try FileManager.default.createDirectory(at: storeDir, withIntermediateDirectories: true)
            let storeURL = storeDir.appendingPathComponent("musiccloud.store")
            let config = ModelConfiguration(url: storeURL)
            let container = try ModelContainer(for: MediaEntry.self, configurations: config)
            AppLogger.history.debug("SwiftData store: \(container.configurations.first?.url.path ?? "unknown")")
            return container
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }()

    private(set) var mainContext: ModelContext!
    private(set) var historyManager: HistoryManager!
    private(set) var monitor: ClipboardMonitor!

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        mainContext = modelContainer.mainContext
        historyManager = HistoryManager(modelContext: mainContext)
        monitor = ClipboardMonitor(historyManager: historyManager)
        setupStatusItem()
        setupPanel()
        setupEventMonitor()
        NotificationManager.requestPermission()
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
                _ = self.monitor.status.isProcessing
            } onChange: {
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    self.iconHostingView.rootView = MenuBarIcon(isProcessing: self.monitor.status.isProcessing)
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
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 280),
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
            width: max(fittingSize.width, 320),
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
        panel.makeKeyAndOrderFront(nil)
    }

    func closePanel() {
        panel.orderOut(nil)
    }
}

// MARK: - Dashboard Window

extension AppDelegate {
    /// Opens the dashboard window, creating it if needed.
    func openDashboard() {
        if let window = dashboardWindow {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let rootView = DashboardWindow()
            .environment(\.modelContext, mainContext)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "musiccloud"
        window.contentViewController = NSHostingController(rootView: rootView)
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("DashboardWindow")
        if !window.setFrameUsingName("DashboardWindow") {
            window.center()
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        dashboardWindow = window
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
