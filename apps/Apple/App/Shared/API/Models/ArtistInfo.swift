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

    private enum CodingKeys: String, CodingKey {
        case name, genresRaw = "genres", artworkUrl, followerCount
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = try container.decode(String.self, forKey: .name)
        let genreArray = try container.decodeIfPresent([String].self, forKey: .genresRaw)
        genresRaw = genreArray?.joined(separator: ", ")
        artworkUrl = try container.decodeIfPresent(String.self, forKey: .artworkUrl)
        followerCount = try container.decodeIfPresent(Int.self, forKey: .followerCount)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encodeIfPresent(genres, forKey: .genresRaw)
        try container.encodeIfPresent(artworkUrl, forKey: .artworkUrl)
        try container.encodeIfPresent(followerCount, forKey: .followerCount)
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
