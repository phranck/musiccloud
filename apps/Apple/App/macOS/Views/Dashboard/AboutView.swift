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
    /// The musiccloud account on Mastodon.
    // swiftlint:disable:next force_unwrapping
    private static let mastodonURL = URL(string: "https://oldbytes.space/@musiccloud")!

    var body: some View {
        Form {
            Section {
                LabeledContent(String(localized: "Version"), value: Bundle.main.appVersion)
                LabeledContent(String(localized: "Website")) {
                    Link("musiccloud.io", destination: MusicCloudAPI.productionURL)
                }
                LabeledContent {
                    Link(destination: Self.mastodonURL) {
                        Text(verbatim: "@musiccloud")
                    }
                } label: {
                    Text(verbatim: "Mastodon")
                }
            } header: {
                AppIdentityHeader()
            }

            if BuildChannel.diagnosticsEnabled {
                DiagnosticsSection()
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - AppIdentityHeader

/// The app icon with the rainbow wordmark below it, centered above the form.
private struct AppIdentityHeader: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 96, height: 96)
            LogoText(size: 28)
                .accessibilityLabel(Text(verbatim: "musiccloud"))
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 12)
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
            exportError = String(localized: "Log export failed: \(error.localizedDescription)",
                                 comment: "Shown below Export Diagnostics; the argument is the system's error message")
        }
    }

    func presentSharePicker(for url: URL) {
        let picker = NSSharingServicePicker(items: [url])
        guard let window = NSApp.keyWindow,
              let contentView = window.contentView else { return }
        picker.show(relativeTo: .zero, of: contentView, preferredEdge: .minY)
    }
}

#Preview {
    AboutView()
        .frame(width: 400, height: 440)
}

#endif
