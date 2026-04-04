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

    var body: some View {
        HStack(spacing: 12) {
            ArtworkView(url: track.artworkUrl)
            VStack(alignment: .leading, spacing: 2) {
                Text(track.title)
                    .font(.system(size: 14))
                    .lineLimit(1)
                Text(track.artistsString)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let duration = track.formattedDuration {
                Text(duration)
                    .font(.system(size: 12).monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            ShareButton(shortUrl: shortUrl)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
    }
}
