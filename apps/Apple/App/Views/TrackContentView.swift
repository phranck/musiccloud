//
//  TrackContentView.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// Displays track information in a horizontal layout.
///
/// Shows artwork, title, artists, duration, and optional share button.
struct TrackContentView: View {
    /// The track metadata to display
    var track: TrackInfo
    /// The short URL to share
    var shortUrl: String
    /// Whether to show the share button
    var showShareButton: Bool

    var body: some View {
        HStack(spacing: 10) {
            ArtworkView(url: track.artworkUrl)
            VStack(alignment: .leading, spacing: 3) {
                Text(track.title)
                    .font(.body)
                    .fontWeight(.medium)
                    .lineLimit(1)
                Text(track.artistsString)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let duration = track.formattedDuration {
                Text(duration)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            if showShareButton {
                ShareLink(item: shortUrl) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Share \(shortUrl)")
                .buttonStyle(.borderless)
            }
        }
    }
}
