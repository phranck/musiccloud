#if os(macOS)
//
//  GeneralPane.swift
//  musiccloud
//

import ServiceManagement
import SwiftUI

// MARK: - GeneralPane

/// The General pane of the Settings window: launch at login and clipboard
/// monitoring.
///
/// Turning clipboard monitoring off stops the ``ClipboardMonitor`` at once,
/// so no further URL is picked up until it is turned on again.
struct GeneralPane: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled
    @AppStorage(DefaultsKey.clipboardMonitoringEnabled) private var clipboardMonitoringEnabled = true

    var body: some View {
        Form {
            Section { Toggle(String(localized: "Launch at Login"), isOn: $launchAtLogin) }.onChange(of: launchAtLogin) {
                updateLaunchAtLogin()
            }

            Section {
                Toggle(String(localized: "Clipboard Monitoring"), isOn: $clipboardMonitoringEnabled)
            } footer: {
                Text("Automatically detects streaming URLs in your clipboard and converts them.")
            }.onChange(of: clipboardMonitoringEnabled) {
                if clipboardMonitoringEnabled { monitor.startMonitoring() } else { monitor.stopMonitoring() }
            }
        }.formStyle(.grouped)
    }
}

private extension GeneralPane {
    /// Registers or unregisters the app as a login item, and shows the
    /// system's actual state again when that fails.
    func updateLaunchAtLogin() {
        do { if launchAtLogin { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } } catch {
            AppLogger.ui.error("Launch at login failed: \(error.localizedDescription)")
            launchAtLogin = SMAppService.mainApp.status == .enabled
        }
    }
}

#endif
