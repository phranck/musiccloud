//
//  MediaItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A view that displays conversion content (track, album, or artist) with appropriate layout.
///
/// Adapts its presentation based on the ``ContentType`` of the entry,
/// showing specialized layouts for tracks, albums, and artists.
struct MediaItem: View {
    /// The conversion entry to display
    var entry: MediaInfo

    var body: some View {
        Group {
            switch entry.contentType {
            case .track(let info):
                TrackItem(track: info, shortUrl: entry.shortUrl)
            case .album(let info):
                AlbumItem(album: info, shortUrl: entry.shortUrl)
            case .artist(let info):
                ArtistItem(artist: info, shortUrl: entry.shortUrl)
            }
        }
    }
}
