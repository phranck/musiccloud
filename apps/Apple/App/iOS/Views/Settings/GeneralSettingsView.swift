#if os(iOS)
import SwiftUI

/// Device behavior settings retain their existing local clipboard and shared sound preference domains.
struct GeneralSettingsView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @AppStorage(DefaultsKey.clipboardMonitoringEnabled) private var clipboardMonitoringEnabled = true
    @AppStorage(DefaultsKey.playNotificationSound, store: DefaultsKey.shared) private var playNotificationSound = true

    var body: some View {
        Form {
            Section {
                Toggle("Clipboard Monitoring", isOn: $clipboardMonitoringEnabled)
            } footer: {
                Text("Automatically detects streaming URLs in your clipboard and converts them.").font(.body).foregroundStyle(.secondary)
            }
            Section("Notifications") { Toggle("Sound on conversion", isOn: $playNotificationSound) }
        }.formStyle(.grouped).onChange(of: clipboardMonitoringEnabled) {
            if clipboardMonitoringEnabled { monitor.startMonitoring() } else { monitor.stopMonitoring() }
        }
    }
}
#endif
