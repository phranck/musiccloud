//
//  AppDelegate.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

#if os(macOS)
import AppKit
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

    let historyManager = HistoryManager()
    private(set) lazy var monitor = ClipboardMonitor(historyManager: historyManager)

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        _ = monitor // force lazy init
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
            contentRect: .zero,
            styleMask: [.nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: true
        )
        panel.isFloatingPanel = true
        panel.level = .popUpMenu
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = true
        panel.isReleasedWhenClosed = false

        let wrapper = EnvironmentWrapper(historyManager: historyManager, monitor: monitor) {
            MenuBarView()
        }

        let hostingView = NSHostingView(rootView: wrapper)
        hostingView.translatesAutoresizingMaskIntoConstraints = false

        panel.contentView = hostingView
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

        let contentSize = panel.contentView?.fittingSize ?? CGSize(width: 280, height: 300)
        let panelRect = NSRect(
            x: buttonFrame.midX - contentSize.width / 2,
            y: buttonFrame.minY - contentSize.height,
            width: contentSize.width,
            height: contentSize.height
        )
        panel.setFrame(panelRect, display: true)

        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
    }

    func closePanel() {
        panel.orderOut(nil)
        NSApp.deactivate()
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

        let dashboardView = EnvironmentWrapper(historyManager: historyManager, monitor: monitor) {
            DashboardWindow()
        }

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 600),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "musiccloud"
        window.contentView = NSHostingView(rootView: dashboardView)
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        dashboardWindow = window
    }
}

// MARK: - Event Monitor

private extension AppDelegate {
    func setupEventMonitor() {
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self, self.panel.isVisible else { return }
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
