#if os(iOS)
import SwiftUI

// MARK: - SettingsView

/// iOS settings screen with notification toggle and about section.
struct SettingsView: View {
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true

    var body: some View {
        Form {
            Section("Notifications") {
                Toggle("Sound on conversion", isOn: $notificationsEnabled)
            }
            Section("About") {
                LabeledContent("Version", value: appVersion)
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

// MARK: - Private API

private extension SettingsView {
    var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }
}

#endif
