#if os(iOS)
import SwiftUI

// MARK: - SettingsView

/// iOS settings screen with notification toggle and about section.
struct SettingsView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @AppStorage("clipboardMonitoringEnabled") private var clipboardMonitoringEnabled = true
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true

    var body: some View {
        Form {
            Section {
                Toggle("Clipboard Monitoring", isOn: $clipboardMonitoringEnabled)
            } footer: {
                Text("Automatically detects streaming URLs in your clipboard and converts them.")
            }
            .onChange(of: clipboardMonitoringEnabled) {
                if clipboardMonitoringEnabled {
                    monitor.startMonitoring()
                } else {
                    monitor.stopMonitoring()
                }
            }

            Section("Notifications") {
                Toggle("Sound on conversion", isOn: $notificationsEnabled)
            }
            DangerZoneSection()

            Section("About") {
                LabeledContent("Version", value: Bundle.main.appVersion)
                Link(destination: URL(string: "https://musiccloud.io")!) {
                    HStack {
                        Text("musiccloud.io")
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Settings")
    }
}

#endif
