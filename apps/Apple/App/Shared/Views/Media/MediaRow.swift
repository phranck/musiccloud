//
//  MediaRow.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A menu bar row displaying a conversion entry with content-specific layouts.
///
/// `MediaRow` adapts its appearance based on the content type (track, album, or artist),
/// delegating to ``MediaItem`` for content display. Includes hover effects and tap-to-open functionality.
///
/// ## Interactions
///
/// - **Hover**: Highlights with accent color background
/// - **Tap**: Copies short URL to clipboard and opens in browser (macOS only)
///
/// ## Usage
///
/// ```swift
/// ForEach(history) { entry in
///     MediaRow(entry: entry)
/// }
/// ```
///
/// ## Topics
///
/// ### Properties
/// - ``entry``
struct MediaRow: View {
    @State private var isHovered = false

    var entry: MediaEntry

    var body: some View {
        MediaItem(entry: entry).background {
            if isHovered { RoundedRectangle(cornerRadius: 16).fill(Self.highlightBackground).padding(.horizontal, 4) }
        }.contentShape(Rectangle()).onTapGesture { copyToClipboardAndOpen() }.onHover { hovering in isHovered = hovering }
    }
}

// MARK: - Highlight

private extension MediaRow {
    /// The same system fill the panel's footer cards take under the pointer,
    /// so everything in the panel answers hover the same way.
    #if os(macOS)
    static let highlightBackground = Color(nsColor: PanelMetrics.hoverFill)
    #else
    static let highlightBackground = Color(uiColor: .systemFill)
    #endif
}

// MARK: - Actions

private extension MediaRow {
    /// Copies the short URL to clipboard, opens it in the browser, and closes the panel (macOS only).
    func copyToClipboardAndOpen() {
        #if os(macOS)
        Pasteboard.copy(entry.shortUrl)

        guard let url = StreamingServices.webURL(entry.shortUrl) else {
            AppLogger.ui.error("Invalid short URL: \(entry.shortUrl)")
            return
        }
        NSWorkspace.shared.open(url)

        NSApp.keyWindow?.close()
        #endif
    }
}
