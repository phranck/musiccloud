//
//  ResolveResponse.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import Foundation

/// Response from the musiccloud.io resolve API endpoint.
///
/// The API returns separate optional fields for track, album, and artist.
/// The computed ``contentType`` property maps these into a ``ContentType``
/// with associated values.
struct ResolveResponse: Decodable {

    /// The shortened musiccloud.io URL (rewritten to match the current base URL)
    var shortUrl: String

    /// Track metadata if the URL was for a track
    var track: TrackInfo?

    /// Album metadata if the URL was for an album
    var album: AlbumInfo?

    /// Artist metadata if the URL was for an artist
    var artist: ArtistInfo?

    /// Resolved service links for cross-platform availability
    var links: [ServiceLink]

    /// Production origin used by the backend when building short URLs
    private static let productionOrigin = "https://musiccloud.io"

    private enum CodingKeys: String, CodingKey {
        case shortUrl, track, album, artist, links
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let rawUrl = try container.decode(String.self, forKey: .shortUrl)
        shortUrl = rawUrl.replacingOccurrences(
            of: Self.productionOrigin,
            with: MusicCloudAPI.baseURL.absoluteString
        )
        // Decode via fromJSON to convert [String] arrays to joined Strings
        track = try container.decodeIfPresent(JSONWrapper<TrackInfo>.self, forKey: .track)?.value
        album = try container.decodeIfPresent(JSONWrapper<AlbumInfo>.self, forKey: .album)?.value
        artist = try container.decodeIfPresent(JSONWrapper<ArtistInfo>.self, forKey: .artist)?.value
        links = (try? container.decodeIfPresent([ServiceLink].self, forKey: .links)) ?? []
    }

    /// Derives the ``ContentType`` from the populated metadata field.
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

    /// Creates a ``MediaEntry`` from this response.
    func toMediaEntry(originalUrl: String, artworkData: Data?) -> MediaEntry {
        let mediaType: MediaType
        if track != nil {
            mediaType = .track
        } else if album != nil {
            mediaType = .album
        } else if artist != nil {
            mediaType = .artist
        } else {
            mediaType = .track
        }

        return MediaEntry(
            originalUrl: originalUrl,
            shortUrl: shortUrl,
            mediaType: mediaType,
            artworkImageData: artworkData,
            track: track,
            album: album,
            artist: artist,
            serviceLinks: links
        )
    }
}

// MARK: - JSONWrapper

/// Decodes API JSON using the type's `fromJSON` factory method instead of standard Codable.
/// This avoids SwiftData's internal decoder which aborts on [String] type mismatch.
private struct JSONWrapper<T>: Decodable {
    let value: T

    init(from decoder: Decoder) throws {
        switch T.self {
        case is TrackInfo.Type:
            value = try TrackInfo.fromJSON(decoder) as! T
        case is AlbumInfo.Type:
            value = try AlbumInfo.fromJSON(decoder) as! T
        case is ArtistInfo.Type:
            value = try ArtistInfo.fromJSON(decoder) as! T
        default:
            fatalError("JSONWrapper used with unsupported type")
        }
    }
}
