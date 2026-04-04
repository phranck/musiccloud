//
//  ContentItemView.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A view that displays conversion content (track, album, or artist) with appropriate layout.
///
/// `ContentItemView` adapts its presentation based on the ``ContentType`` of the entry,
/// showing specialized layouts for tracks, albums, and artists with metadata, artwork,
/// and optional share buttons.
///
/// ## Content Types
///
/// - **Track**: Title, artists, duration, artwork
/// - **Album**: Name, artists, track count, artwork
/// - **Artist**: Name, genres, follower count, artwork
///
/// ## Usage
///
/// ```swift
/// ContentItemView(
///     entry: conversionEntry,
///     showShareButton: true,
///     includePadding: true
/// )
/// ```
///
/// ## Topics
///
/// ### Initialization
/// - ``init(entry:showShareButton:includePadding:)``
///
/// ### Properties
/// - ``entry``
/// - ``showShareButton``
/// - ``includePadding``
struct ContentItemView: View {
    /// The conversion entry to display
    var entry: MediaInfo
    /// Whether to show the share button
    var showShareButton: Bool = true
    /// Whether to include padding around the content
    var includePadding: Bool = true

    var body: some View {
        Group {
            switch entry.contentType {
            case .track:
                if let track = entry.track {
                    TrackContentView(track: track, shortUrl: entry.shortUrl, showShareButton: showShareButton)
                }
            case .album:
                if let album = entry.album {
                    AlbumContentView(album: album, shortUrl: entry.shortUrl, showShareButton: showShareButton)
                }
            case .artist:
                if let artist = entry.artist {
                    ArtistContentView(artist: artist, shortUrl: entry.shortUrl, showShareButton: showShareButton)
                }
            }
        }
        .if(includePadding) { view in
            view
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
        }
    }
}
