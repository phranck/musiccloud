//
//  MenuBarHistoryRow.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A menu bar row displaying a conversion entry with content-specific layouts.
///
/// `MenuBarHistoryRow` adapts its appearance based on the content type (track, album, or artist),
/// showing appropriate metadata, artwork, and actions. Includes hover effects and tap-to-open functionality.
///
/// ## Content Types
///
/// - **Track**: Shows artwork, title, artists, and duration
/// - **Album**: Shows artwork, name, artists, and track count
/// - **Artist**: Shows artwork, name, genres, and follower count
///
/// ## Interactions
///
/// - **Hover**: Highlights with accent color background
/// - **Tap**: Copies short URL to clipboard and opens in browser (macOS only)
/// - **Share Button**: System share sheet for the short URL
///
/// ## Usage
///
/// ```swift
/// ForEach(history) { entry in
///     MenuBarHistoryRow(entry: entry)
/// }
/// ```
///
/// ## Topics
///
/// ### Properties
/// - ``entry``
struct HistoryRow: View {
    @State private var isHovered = false

    var entry: MediaInfo

    var body: some View {
        MediaContentView(entry: entry)
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

private extension HistoryRow {
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
