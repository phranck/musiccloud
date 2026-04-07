//
//  MediaEntry.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import Foundation
import SwiftData

/// SwiftData model representing a resolved media entry in the conversion history.
///
/// Replaces the previous `NSUbiquitousKeyValueStore`-based persistence with
/// SwiftData and CloudKit sync, removing the 1MB storage limit.
///
/// ## Storage Details
///
/// - `artworkImageData` uses `@Attribute(.externalStorage)` to store large images as external files
/// - `track`, `album`, `artist` are stored as Codable transformable properties
/// - CloudKit sync is handled automatically by the SwiftData `ModelContainer`
@Model
final class MediaEntry {
    var id: UUID = UUID()
    var originalUrl: String = ""
    var shortUrl: String = ""
    var mediaType: String = "track"
    @Attribute(.externalStorage) var artworkImageData: Data?
    var date: Date = Date()

    var track: TrackInfo?
    var album: AlbumInfo?
    var artist: ArtistInfo?
    var serviceLinks: [ServiceLink] = []

    /// Reconstructs the ``ContentType`` enum from the stored flat properties.
    ///
    /// This computed property keeps Views compatible -- they can continue to
    /// switch over `contentType` without knowing about the SwiftData storage layout.
    var contentType: ContentType {
        if let track {
            return .track(info: track)
        } else if let album {
            return .album(info: album)
        } else if let artist {
            return .artist(info: artist)
        } else {
            return .track(info: TrackInfo(title: "", artists: []))
        }
    }

    init(
        id: UUID = UUID(),
        originalUrl: String,
        shortUrl: String,
        mediaType: String,
        artworkImageData: Data? = nil,
        date: Date = .now,
        track: TrackInfo? = nil,
        album: AlbumInfo? = nil,
        artist: ArtistInfo? = nil,
        serviceLinks: [ServiceLink] = []
    ) {
        self.id = id
        self.originalUrl = originalUrl
        self.shortUrl = shortUrl
        self.mediaType = mediaType
        self.artworkImageData = artworkImageData
        self.date = date
        self.track = track
        self.album = album
        self.artist = artist
        self.serviceLinks = serviceLinks
    }
}
