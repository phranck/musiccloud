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

    /// The sky's design-token values: the defaults, then the saved copy,
    /// then what the backend serves when the pane appears.
    @State private var skyTokens = SkyTokens()

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
        .scrollContentBackground(.hidden)
        .background {
            AboutBackground(tokens: skyTokens)
                .ignoresSafeArea()
        }
        .task {
            await loadSkyTokens()
        }
    }

    /// Shows the saved values first, so an offline start draws the sky the
    /// backend served last, and then the current ones.
    private func loadSkyTokens() async {
        if let saved = await SkyTokens.saved() {
            skyTokens = saved
        }
        if let fetched = await SkyTokens.fetchAndSave() {
            skyTokens = fetched
        }
    }
}

// MARK: - AboutBackground

/// The website's sky behind the About pane.
///
/// At night it fills the whole pane. By day it is a band behind the app icon
/// and the wordmark that fades into the window background above the form:
/// the day sky's saturated blue would otherwise tint the whole window, the
/// sidebar's glass included, and dark text on it is hard to read.
private struct AboutBackground: View {
    /// Where the day band starts to fade and where it is gone, as fractions
    /// of the pane's height, so the fade ends above the form's first section.
    private static let dayFadeStart = 0.28
    private static let dayFadeEnd = 0.50

    /// The values the sky is drawn with.
    let tokens: SkyTokens

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        if colorScheme == .dark {
            NightSkyBackground(tokens: tokens)
        } else {
            NightSkyBackground(tokens: tokens)
                .mask {
                    LinearGradient(stops: [
                        .init(color: .black, location: Self.dayFadeStart),
                        .init(color: .clear, location: Self.dayFadeEnd),
                    ], startPoint: .top, endPoint: .bottom)
                }
                .background(Color(nsColor: .windowBackgroundColor))
        }
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
                // Lifts the icon off the sky, which is busiest behind it.
                .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
            OutlinedWordmark()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: "musiccloud"))
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 36)
    }
}

// MARK: - OutlinedWordmark

/// The rainbow wordmark with a black outline one pixel wide, so its light
/// colors keep their edge on the bright day sky.
///
/// SwiftUI has no stroke for text, so black copies of the wordmark sit one
/// pixel off in eight directions behind it.
private struct OutlinedWordmark: View {
    private static let fontSize: CGFloat = 28
    private static let outlineDirections = 8

    @Environment(\.displayScale) private var displayScale

    var body: some View {
        let pixel = 1 / displayScale
        ZStack {
            ForEach(0..<Self.outlineDirections, id: \.self) { direction in
                let angle = Double(direction) * 2 * .pi / Double(Self.outlineDirections)
                LogoText(size: Self.fontSize)
                    .colorMultiply(.black)
                    .offset(x: cos(angle) * pixel, y: sin(angle) * pixel)
            }
            LogoText(size: Self.fontSize)
        }
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
