//
//  ArtistContentView.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// Displays artist information in a horizontal layout.
///
/// Shows artwork, name, genres, follower count, and optional share button.
struct ArtistContentView: View {
    /// The artist metadata to display
    var artist: ArtistInfo
    /// The short URL to share
    var shortUrl: String
    /// Whether to show the share button
    var showShareButton: Bool

    var body: some View {
        HStack(spacing: 10) {
            ArtworkView(url: artist.artworkUrl)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Image(systemName: "person.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(artist.name)
                        .font(.body)
                        .fontWeight(.medium)
                }
                .lineLimit(1)
                if let genres = artist.genresString {
                    Text(genres)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                } else {
                    Text("Artist")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            if let followers = artist.formattedFollowers {
                Text("\(followers) followers")
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
