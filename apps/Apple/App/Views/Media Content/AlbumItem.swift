//
//  AlbumItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// Displays album information in a horizontal layout.
///
/// Shows artwork, name, artists, track count, and share button.
struct AlbumItem: View {
    /// The album metadata to display
    var album: AlbumInfo
    /// The short URL to share
    var shortUrl: String

    var body: some View {
        HStack(spacing: 12) {
            MediaArtwork(url: album.artworkUrl)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "square.stack")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Text(album.name)
                        .font(.system(size: 14))
                }
                .lineLimit(1)
                Text(album.artistsString)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)

            if let totalTracks = album.totalTracks {
                Text("\(totalTracks) tracks")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }

            ShareButton(shortUrl: shortUrl)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
    }
}
