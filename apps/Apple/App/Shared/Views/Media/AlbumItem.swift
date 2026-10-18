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
    /// The entry the metadata belongs to, for its artwork and short URL
    var entry: MediaEntry

    var body: some View {
        HStack(spacing: 12) {
            MediaArtwork(entry: entry)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: MediaType.album.icon).font(.system(size: 10)).foregroundStyle(.secondary)
                    Text(album.title).font(.system(size: 14))
                }.lineLimit(1)
                Text(album.artistsString).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)

            if let totalTracks = album.totalTracks { Text("\(totalTracks) tracks").font(.system(size: 12)).foregroundStyle(.secondary) }

            ShareButton(shortUrl: entry.shortUrl)
        }.padding(.horizontal, 10).padding(.vertical, 5)
    }
}
