#if os(iOS)
import SwiftUI

/// Owns log export progress, failures and sharing without keeping support state in the Settings overview.
struct DiagnosticsSettingsView: View {
    @State private var exportedLog: DiagnosticsExportedLog?
    @State private var isExporting = false
    @State private var exportError: String?

    var body: some View {
        Form {
            Section {
                Button {
                    Task { await exportLogs() }
                } label: {
                    HStack {
                        Label("Export Diagnostics", systemImage: "square.and.arrow.up")
                        Spacer()
                        if isExporting { ProgressView().controlSize(.small) }
                    }
                }.disabled(isExporting)
                if let exportError { Text(exportError).foregroundStyle(.red) }
            } footer: {
                Text("Writes the last 6 hours of app logs to a file you can share. Only visible in Testflight builds.").font(.body)
                    .foregroundStyle(.secondary)
            }
        }.formStyle(.grouped).sheet(item: $exportedLog) { log in DiagnosticsShareSheet(activityItems: [log.url]) }
    }
}

private extension DiagnosticsSettingsView {
    /// Exports asynchronously and presents the existing system share UI only after a file is available.
    func exportLogs() async {
        isExporting = true
        exportError = nil
        defer { isExporting = false }
        do { exportedLog = DiagnosticsExportedLog(url: try await DiagnosticsExporter.exportLogs()) } catch {
            exportError = String(
                localized: "Log export failed: \(error.localizedDescription)",
                comment: "Shown below Export Diagnostics; the argument is the system's error message"
            )
        }
    }
}

/// Stable identity lets SwiftUI present one share sheet for the completed export.
private struct DiagnosticsExportedLog: Identifiable {
    let url: URL
    var id: URL { url }
}

/// Adapts the system activity controller without opening or modifying another application itself.
private struct DiagnosticsShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    /// Creates the system share controller for the completed log file.
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    /// Export URLs are immutable while the share controller is presented.
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#endif
