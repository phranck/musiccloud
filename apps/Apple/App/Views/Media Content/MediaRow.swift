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

    var entry: MediaInfo

    var body: some View {
        MediaItem(entry: entry)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isHovered ? Color.accentColor : Color.clear)
                    .padding(.horizontal, 4)
            )
            .foregroundStyle(isHovered ? Color.white : Color.primary)
            .contentShape(Rectangle())
            .onTapGesture {
                copyToClipboardAndOpen()
            }
            .onHover { hovering in
                isHovered = hovering
            }
    }
}

// MARK: - Actions

private extension MediaRow {
    /// Copies the short URL to clipboard and opens it in the browser (macOS only).
    func copyToClipboardAndOpen() {
#if os(macOS)
        // 1. Copy to clipboard
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(entry.shortUrl, forType: .string)

        // 2. Open in browser
        if let url = URL(string: entry.shortUrl) {
            NSWorkspace.shared.open(url)
        }
#endif
    }
}
