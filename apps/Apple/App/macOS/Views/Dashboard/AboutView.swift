#if os(macOS)
//
//  AboutView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import AppKit
import SwiftUI

/// About pane. Also hosts the Testflight-only "Export diagnostics"
/// button: in App Store builds the whole diagnostics section is
/// suppressed by ``BuildChannel/diagnosticsEnabled``.
struct AboutView: View {

    @State private var isExporting = false
    @State private var exportError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(alignment: .top, spacing: 16) {
                Image(systemName: "info.circle")
                    .font(.system(size: 36))
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 4) {
                    Text("musiccloud")
                        .font(.title)
                        .bold()
                    Text("Version \(Bundle.main.appVersion)")
                        .font(.body)
                        .foregroundStyle(.secondary)
                    Link("musiccloud.io",
                         destination: URL(string: "https://musiccloud.io")!)
                        .font(.body)
                }
                Spacer()
            }

            if BuildChannel.diagnosticsEnabled {
                diagnosticsSection
            }

            Spacer()
        }
        .padding(24)
    }

    private var diagnosticsSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Text("Writes the last 6 hours of app logs to a file you can send to support. Only available in Testflight builds.")
                    .font(.body)
                    .foregroundStyle(.secondary)

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
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
            .padding(4)
        } label: {
            Text("Diagnostics")
                .font(.headline)
        }
    }

    private func exportLogs() async {
        isExporting = true
        exportError = nil
        defer { isExporting = false }
        do {
            let url = try await DiagnosticsExporter.exportLogs()
            await MainActor.run { presentSharePicker(for: url) }
        } catch {
            exportError = "Log export failed: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func presentSharePicker(for url: URL) {
        let picker = NSSharingServicePicker(items: [url])
        guard let window = NSApp.keyWindow,
              let contentView = window.contentView else { return }
        picker.show(relativeTo: .zero, of: contentView, preferredEdge: .minY)
    }
}

#endif
