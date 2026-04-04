//
//  HistoryRow.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A row displaying a single conversion entry in the history list.
///
/// `HistoryRow` shows the short URL, original URL, and a share button in a
/// compact horizontal layout. Used in ``HistoryList`` for iOS/iPadOS.
///
/// ## Appearance
///
/// - **Short URL**: Monospaced font, primary color
/// - **Original URL**: Caption size, secondary color
/// - **Share Button**: Share icon on the right side
///
/// ## Usage
///
/// ```swift
/// ForEach(entries) { entry in
///     HistoryRow(entry: entry)
/// }
/// ```
///
/// ## Topics
///
/// ### Properties
/// - ``entry``
struct HistoryRow: View {
    var entry: MediaInfo

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.shortUrl)
                    .font(.subheadline.monospaced())
                    .lineLimit(1)
                Text(entry.originalUrl)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            ShareLink(item: entry.shortUrl) {
                Image(systemName: "square.and.arrow.up")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel("Share \(entry.shortUrl)")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}
