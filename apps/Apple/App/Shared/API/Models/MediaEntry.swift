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
/// Metadata structs (TrackInfo, AlbumInfo, ArtistInfo, [ServiceLink]) are stored
/// as opaque JSON Data blobs to avoid CloudKit compatibility issues with
/// SwiftData's Codable decomposition of `[String]` arrays.
@Model
final class MediaEntry {
    var id: UUID = UUID()
    var originalUrl: String = ""
    var shortUrl: String = ""
    private var mediaTypeRaw: String = MediaType.track.rawValue
    @Attribute(.externalStorage) var artworkImageData: Data?
    var date: Date = Date()

    // MARK: - JSON Data Storage

    private var trackData: Data?
    private var albumData: Data?
    private var artistData: Data?
    private var serviceLinksData: Data?

    // MARK: - Decode Cache

    @Transient private var _cachedTrack: TrackInfo??
    @Transient private var _cachedAlbum: AlbumInfo??
    @Transient private var _cachedArtist: ArtistInfo??
    @Transient private var _cachedServiceLinks: [ServiceLink]?

    // MARK: - Typed Accessors

    @Transient var mediaType: MediaType {
        get { MediaType(rawValue: mediaTypeRaw) ?? .track }
        set { mediaTypeRaw = newValue.rawValue }
    }

    @Transient var track: TrackInfo? {
        get {
            if let cached = _cachedTrack { return cached }
            let decoded = trackData.flatMap { try? JSONDecoder().decode(TrackInfo.self, from: $0) }
            _cachedTrack = .some(decoded)
            return decoded
        }
        set {
            _cachedTrack = .some(newValue)
            trackData = newValue.flatMap { try? JSONEncoder().encode($0) }
        }
    }

    @Transient var album: AlbumInfo? {
        get {
            if let cached = _cachedAlbum { return cached }
            let decoded = albumData.flatMap { try? JSONDecoder().decode(AlbumInfo.self, from: $0) }
            _cachedAlbum = .some(decoded)
            return decoded
        }
        set {
            _cachedAlbum = .some(newValue)
            albumData = newValue.flatMap { try? JSONEncoder().encode($0) }
        }
    }

    @Transient var artist: ArtistInfo? {
        get {
            if let cached = _cachedArtist { return cached }
            let decoded = artistData.flatMap { try? JSONDecoder().decode(ArtistInfo.self, from: $0) }
            _cachedArtist = .some(decoded)
            return decoded
        }
        set {
            _cachedArtist = .some(newValue)
            artistData = newValue.flatMap { try? JSONEncoder().encode($0) }
        }
    }

    @Transient var serviceLinks: [ServiceLink] {
        get {
            if let cached = _cachedServiceLinks { return cached }
            let decoded = serviceLinksData.flatMap { try? JSONDecoder().decode([ServiceLink].self, from: $0) } ?? []
            _cachedServiceLinks = decoded
            return decoded
        }
        set {
            _cachedServiceLinks = newValue
            serviceLinksData = try? JSONEncoder().encode(newValue)
        }
    }

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
        mediaType: MediaType,
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
        self.mediaTypeRaw = mediaType.rawValue
        self.artworkImageData = artworkImageData
        self.date = date
        self.trackData = track.flatMap { try? JSONEncoder().encode($0) }
        self.albumData = album.flatMap { try? JSONEncoder().encode($0) }
        self.artistData = artist.flatMap { try? JSONEncoder().encode($0) }
        self.serviceLinksData = try? JSONEncoder().encode(serviceLinks)
    }
}
