//
//  ResolveResponse.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import Foundation

/// Response from the musiccloud.io resolve API endpoint.
struct ResolveResponse: Decodable {
    var shortUrl: String
    var track: TrackInfo?
    var album: AlbumInfo?
    var artist: ArtistInfo?
    var links: [ServiceLink]

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
        track = try container.decodeIfPresent(TrackInfo.self, forKey: .track)
        album = try container.decodeIfPresent(AlbumInfo.self, forKey: .album)
        artist = try container.decodeIfPresent(ArtistInfo.self, forKey: .artist)
        do {
            links = try container.decodeIfPresent([ServiceLink].self, forKey: .links) ?? []
        } catch {
            AppLogger.api.warning("Failed to decode service links: \(error)")
            links = []
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
