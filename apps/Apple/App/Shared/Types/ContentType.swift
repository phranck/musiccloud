//
//  ContentType.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import Foundation

/// Defines the type of music content represented by a URL.
///
/// Content types determine what kind of metadata is available and how
/// the content should be displayed in the UI.
///
/// ## Topics
///
/// ### Cases
/// - ``track``
/// - ``album``
/// - ``artist``
enum ContentType: Codable, Equatable {
    /// A single music track or song
    case track(info: TrackInfo)
    /// An album or EP containing multiple tracks
    case album(info: AlbumInfo)
    /// A music artist or band
    case artist(info: ArtistInfo)
}
