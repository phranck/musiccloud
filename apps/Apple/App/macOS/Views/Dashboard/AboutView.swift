#if os(macOS)
//
//  AboutView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import AppKit
import SwiftUI

/// About pane of the Settings window. Also hosts the Testflight-only
/// "Export diagnostics" button: in App Store builds the whole diagnostics
/// section is suppressed by ``BuildChannel/diagnosticsEnabled``.
struct AboutView: View {
    var body: some View {
        Form {
            Section {
                AppIdentityRow()
                LabeledContent(String(localized: "Version"), value: Bundle.main.appVersion)
                LabeledContent(String(localized: "Website")) {
                    Link("musiccloud.io", destination: MusicCloudAPI.productionURL)
                }
            }

            if BuildChannel.diagnosticsEnabled {
                DiagnosticsSection()
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - AppIdentityRow

private struct AppIdentityRow: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 48, height: 48)
            Text("musiccloud")
                .font(.title2)
                .bold()
        }
        .padding(.vertical, 4)
    }
}

// MARK: - DiagnosticsSection

private struct DiagnosticsSection: View {
    @State private var isExporting = false
    @State private var exportError: String?

    var body: some View {
        Section {
            HStack {
                Button {
                    Task { await exportLogs() }
                } label: {
                    Label("Export Diagnostics", systemImage: "square.and.arrow.up")
                }
                .disabled(isExporting)

                if isExporting {
                    ProgressView().controlSize(.small)
                }
            }

            if let exportError {
                Text(exportError)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Diagnostics")
        } footer: {
            Text("Writes the last 6 hours of app logs to a file you can send to support. Only available in Testflight builds.")
        }
    }
}

private extension DiagnosticsSection {
    func exportLogs() async {
        isExporting = true
        exportError = nil
        defer { isExporting = false }
        do {
            let url = try await DiagnosticsExporter.exportLogs()
            presentSharePicker(for: url)
        } catch {
            exportError = "Log export failed: \(error.localizedDescription)"
        }
    }

    func presentSharePicker(for url: URL) {
        let picker = NSSharingServicePicker(items: [url])
        guard let window = NSApp.keyWindow,
              let contentView = window.contentView else { return }
        picker.show(relativeTo: .zero, of: contentView, preferredEdge: .minY)
    }
}

#endif
