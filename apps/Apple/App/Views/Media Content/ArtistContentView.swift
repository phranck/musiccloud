//
//  ArtistContentView.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// Displays artist information in a horizontal layout.
///
/// Shows artwork, name, genres, follower count, and share button.
struct ArtistContentView: View {
    /// The artist metadata to display
    var artist: ArtistInfo
    /// The short URL to share
    var shortUrl: String

    var body: some View {
        HStack(spacing: 12) {
            ArtworkView(url: artist.artworkUrl)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "person.circle")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Text(artist.name)
                        .font(.system(size: 14))
                }
                .lineLimit(1)
                if let genres = artist.genresString {
                    Text(genres)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            if let followers = artist.formattedFollowers {
                Text(followers)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            ShareButton(shortUrl: shortUrl)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
    }
}
