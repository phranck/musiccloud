//
//  ResolveResponse.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import Foundation

/// Response from the musiccloud.io resolve API endpoint.
struct ResolveResponse: Decodable, Sendable {
    var shortUrl: String
    var track: TrackInfo?
    var album: AlbumInfo?
    var artist: ArtistInfo?
    var links: [ServiceLink]

    /// The origin the backend writes into every short link, whichever host served the request.
    private static let productionOrigin = URLComponents(url: MusicCloudAPI.productionURL, resolvingAgainstBaseURL: false)

    private enum CodingKeys: String, CodingKey { case shortUrl, track, album, artist, links }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        shortUrl = try container.decode(String.self, forKey: .shortUrl)
        track = try container.decodeIfPresent(TrackInfo.self, forKey: .track)
        album = try container.decodeIfPresent(AlbumInfo.self, forKey: .album)
        artist = try container.decodeIfPresent(ArtistInfo.self, forKey: .artist)
        do { links = try container.decodeIfPresent([ServiceLink].self, forKey: .links) ?? [] } catch {
            AppLogger.api.warning("Failed to decode service links: \(error)")
            links = []
        }
    }

    /// Returns this response with its short link moved onto the host that answered.
    ///
    /// The short link is copied to the clipboard, shared and opened, so it has
    /// to point at musiccloud. A link on any other origin, or with any other
    /// scheme, is refused rather than stored. A link on the production origin
    /// is moved onto `baseURL`, so a development backend hands out links to
    /// itself.
    ///
    /// - Parameter baseURL: The base URL the resolve request was sent to.
    /// - Returns: A copy whose `shortUrl` starts with `baseURL`.
    /// - Throws: ``ResolveError/invalidResponse`` when the short link is on another origin.
    func pointing(at baseURL: URL) throws -> ResolveResponse {
        guard let link = URLComponents(string: shortUrl), let base = URLComponents(url: baseURL, resolvingAgainstBaseURL: false),
            Self.hasSameOrigin(link, base) || Self.productionOrigin.map({ Self.hasSameOrigin(link, $0) }) == true
        else {
            AppLogger.api.error("Refused short link outside the musiccloud origin")
            throw ResolveError.invalidResponse
        }

        var moved = base
        moved.percentEncodedPath = link.percentEncodedPath
        moved.percentEncodedQuery = link.percentEncodedQuery
        moved.percentEncodedFragment = nil
        guard let movedString = moved.string else { throw ResolveError.invalidResponse }

        var copy = self
        copy.shortUrl = movedString
        return copy
    }

    /// Compares scheme, host and port, ignoring case where URLs do.
    private static func hasSameOrigin(_ lhs: URLComponents, _ rhs: URLComponents) -> Bool {
        lhs.scheme?.lowercased() == rhs.scheme?.lowercased() && lhs.host?.lowercased() == rhs.host?.lowercased() && lhs.port == rhs.port
            && lhs.host?.isEmpty == false
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

// MARK: - Conversion

/// A finished conversion: the backend's answer and the artwork that goes with it.
///
/// It is a value, so it can come back from the network work on the
/// concurrent pool. The ``MediaEntry`` is made from it on the actor that
/// stores it, because a SwiftData model belongs to its context.
struct Conversion: Sendable {
    let response: ResolveResponse
    let artworkData: Data?

    /// The history entry for this conversion.
    ///
    /// - Parameter originalUrl: The streaming URL the user converted.
    func makeEntry(originalUrl: String) -> MediaEntry { response.toMediaEntry(originalUrl: originalUrl, artworkData: artworkData) }
}
