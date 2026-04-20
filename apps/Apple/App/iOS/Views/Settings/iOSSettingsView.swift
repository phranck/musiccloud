#if os(iOS)
import SwiftUI

// MARK: - SettingsView

/// iOS settings screen with notification toggle and about section.
struct SettingsView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @AppStorage("clipboardMonitoringEnabled") private var clipboardMonitoringEnabled = true
    @AppStorage("notificationsEnabled") private var notificationsEnabled = true

    @State private var exportedLogURL: URL?
    @State private var isExporting = false
    @State private var exportError: String?

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

            if BuildChannel.diagnosticsEnabled {
                diagnosticsSection
            }

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

    @ViewBuilder
    private var diagnosticsSection: some View {
        Section {
            Button {
                Task { await exportLogs() }
            } label: {
                HStack {
                    Label("Export Diagnostics", systemImage: "square.and.arrow.up")
                    Spacer()
                    if isExporting {
                        ProgressView().controlSize(.small)
                    }
                }
            }
            .disabled(isExporting)

            if let exportError {
                Text(exportError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Diagnostics")
        } footer: {
            Text("Writes the last 6 hours of app logs to a file you can share. Only visible in Testflight builds.")
        }
        .sheet(item: exportedLogBinding) { wrapper in
            ShareSheet(activityItems: [wrapper.url])
        }
    }

    private var exportedLogBinding: Binding<ExportedLog?> {
        Binding(
            get: { exportedLogURL.map(ExportedLog.init) },
            set: { value in exportedLogURL = value?.url }
        )
    }

    private func exportLogs() async {
        isExporting = true
        exportError = nil
        defer { isExporting = false }
        do {
            exportedLogURL = try await DiagnosticsExporter.exportLogs()
        } catch {
            exportError = "Log export failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - Share sheet wrappers

private struct ExportedLog: Identifiable {
    let url: URL
    var id: URL { url }
}

private struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#endif
