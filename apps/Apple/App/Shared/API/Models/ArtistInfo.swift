//
//  ArtistInfo.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

/// Metadata information for a music artist.
///
/// Contains all relevant information about an artist including name, genres,
/// artwork, and follower count.
///
/// ## Topics
///
/// ### Properties
/// - ``name``
/// - ``genres``
/// - ``artworkUrl``
/// - ``followerCount``
///
/// ### Computed Properties
/// - ``genresString``
/// - ``formattedFollowers``
struct ArtistInfo: Codable, Equatable {

    /// The artist's name
    var name: String

    /// Comma-separated genre names (stored as String for CloudKit compatibility)
    var genresRaw: String?

    /// URL to the artist's profile or promotional image
    var artworkUrl: String?

    /// Number of followers on the streaming service
    var followerCount: Int?

    /// Array accessor for genre names.
    var genres: [String]? {
        guard let raw = genresRaw, !raw.isEmpty else { return nil }
        return raw.components(separatedBy: ", ")
    }

    init(name: String, genres: [String]? = nil, artworkUrl: String? = nil, followerCount: Int? = nil) {
        self.name = name
        self.genresRaw = genres?.joined(separator: ", ")
        self.artworkUrl = artworkUrl
        self.followerCount = followerCount
    }

    /// Decodes from API JSON where `"genres"` is `[String]?`.
    static func fromJSON(_ decoder: Decoder) throws -> ArtistInfo {
        let c = try decoder.container(keyedBy: JSONKeys.self)
        return ArtistInfo(
            name: try c.decode(String.self, forKey: .name),
            genres: try c.decodeIfPresent([String].self, forKey: .genres),
            artworkUrl: try c.decodeIfPresent(String.self, forKey: .artworkUrl),
            followerCount: try c.decodeIfPresent(Int.self, forKey: .followerCount)
        )
    }

    private enum JSONKeys: String, CodingKey {
        case name, genres, artworkUrl, followerCount
    }
}

extension ArtistInfo {

    /// Returns all genres joined as a comma-separated string.
    ///
    /// - Returns: Formatted genre string, or `nil` if no genres are available
    ///
    /// ## Example
    /// ```swift
    /// let artist = ArtistInfo(name: "Artist", genres: ["Pop", "Rock"])
    /// print(artist.genresString) // "Pop, Rock"
    /// ```
    var genresString: String? {
        guard let raw = genresRaw, !raw.isEmpty else { return nil }
        return raw
    }

    /// Returns the follower count formatted with K/M suffixes.
    ///
    /// - Returns: Formatted follower string (e.g., "1.5M", "42.3K"), or `nil` if count is unavailable
    ///
    /// ## Examples
    /// - 1,234 → "1.2K"
    /// - 1,234,567 → "1.2M"
    /// - 42 → "42"
    var formattedFollowers: String? {
        guard let count = followerCount else { return nil }
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000)
        } else if count >= 1_000 {
            return String(format: "%.1fK", Double(count) / 1_000)
        } else {
            return "\(count)"
        }
    }
}
