//
//  ContentItemView.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A view that displays conversion content (track, album, or artist) with appropriate layout.
///
/// Adapts its presentation based on the ``ContentType`` of the entry,
/// showing specialized layouts for tracks, albums, and artists.
struct MediaContentView: View {
    /// The conversion entry to display
    var entry: MediaInfo

    var body: some View {
        Group {
            switch entry.contentType {
            case .track(let info):
                TrackContentView(track: info, shortUrl: entry.shortUrl)
            case .album(let info):
                AlbumContentView(album: info, shortUrl: entry.shortUrl)
            case .artist(let info):
                ArtistContentView(artist: info, shortUrl: entry.shortUrl)
            }
        }
    }
}
