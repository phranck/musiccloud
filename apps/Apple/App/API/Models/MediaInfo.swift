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
enum ContentType: String, Codable {
    /// A single music track or song
    case track
    /// An album or EP containing multiple tracks
    case album
    /// A music artist or band
    case artist
}

/// Represents a successful URL conversion from a streaming service to musiccloud.
///
/// `ConversionEntry` stores all information about a converted URL including
/// the original URL, short URL, metadata (track/album/artist info), and artwork.
/// Each entry is uniquely identified and can be persisted for history tracking.
///
/// ## Storage
///
/// Entries are automatically managed by ``HistoryManager`` and displayed
/// in the conversion history UI. They conform to `Codable` for persistence
/// and `Identifiable` for use in SwiftUI lists.
///
/// ## Topics
///
/// ### Creating an Entry
/// - ``init(id:originalUrl:shortUrl:contentType:track:album:artist:artworkImageData:date:)``
///
/// ### Properties
/// - ``id``
/// - ``originalUrl``
/// - ``shortUrl``
/// - ``contentType``
/// - ``track``
/// - ``album``
/// - ``artist``
/// - ``artworkImageData``
/// - ``date``
struct MediaInfo: Codable, Identifiable, Equatable {
    /// Unique identifier for this conversion entry
    let id: UUID
    /// The original streaming service URL that was converted
    var originalUrl: String
    /// The shortened musiccloud.io URL
    var shortUrl: String
    /// The type of content (track, album, or artist)
    var contentType: ContentType
    /// Track metadata if this is a track URL
    var track: TrackInfo?
    /// Album metadata if this is an album URL
    var album: AlbumInfo?
    /// Artist metadata if this is an artist URL
    var artist: ArtistInfo?
    /// Downloaded artwork image data in PNG or JPEG format
    var artworkImageData: Data?
    /// Timestamp when this conversion was created
    var date: Date

    /// Creates a new conversion entry.
    ///
    /// - Parameters:
    ///   - id: Unique identifier (default: auto-generated UUID)
    ///   - originalUrl: The source streaming URL
    ///   - shortUrl: The generated musiccloud.io URL
    ///   - contentType: Type of content (default: `.track`)
    ///   - track: Track metadata if available
    ///   - album: Album metadata if available
    ///   - artist: Artist metadata if available
    ///   - artworkImageData: Downloaded artwork data
    ///   - date: Creation timestamp (default: current time)
    init(
        id: UUID = UUID(),
        originalUrl: String,
        shortUrl: String,
        contentType: ContentType = .track,
        track: TrackInfo? = nil,
        album: AlbumInfo? = nil,
        artist: ArtistInfo? = nil,
        artworkImageData: Data? = nil,
        date: Date = .now
    ) {
        self.id = id
        self.originalUrl = originalUrl
        self.shortUrl = shortUrl
        self.contentType = contentType
        self.track = track
        self.album = album
        self.artist = artist
        self.artworkImageData = artworkImageData
        self.date = date
    }
}
