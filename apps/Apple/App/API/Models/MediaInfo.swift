//
//  MediaInfo.swift
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

/// Represents a successful URL conversion from a streaming service to musiccloud.
///
/// Stores all information about a converted URL including the original URL,
/// short URL, content metadata (via ``ContentType`` associated values), and artwork.
/// Each entry is uniquely identified and can be persisted for history tracking.
struct MediaInfo: Codable, Identifiable, Equatable {
    /// Unique identifier for this conversion entry
    let id: UUID
    /// The original streaming service URL that was converted
    var originalUrl: String
    /// The shortened musiccloud.io URL
    var shortUrl: String
    /// The type and metadata of the content (track, album, or artist)
    var contentType: ContentType
    /// Downloaded artwork image data in PNG or JPEG format
    var artworkImageData: Data?
    /// Timestamp when this conversion was created
    var date: Date

    init(
        id: UUID = UUID(),
        originalUrl: String,
        shortUrl: String,
        contentType: ContentType,
        artworkImageData: Data? = nil,
        date: Date = .now
    ) {
        self.id = id
        self.originalUrl = originalUrl
        self.shortUrl = shortUrl
        self.contentType = contentType
        self.artworkImageData = artworkImageData
        self.date = date
    }
}
