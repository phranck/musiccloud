//
//  AlbumContentView.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// Displays album information in a horizontal layout.
///
/// Shows artwork, name, artists, track count, and optional share button.
struct AlbumContentView: View {
    /// The album metadata to display
    var album: AlbumInfo
    /// The short URL to share
    var shortUrl: String
    /// Whether to show the share button
    var showShareButton: Bool

    var body: some View {
        HStack(spacing: 10) {
            ArtworkView(url: album.artworkUrl)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Image(systemName: "square.stack")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(album.name)
                        .font(.body)
                        .fontWeight(.medium)
                }
                .lineLimit(1)
                Text(album.artistsString)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let totalTracks = album.totalTracks {
                Text("\(totalTracks) tracks")
                    .font(.subheadline)
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
