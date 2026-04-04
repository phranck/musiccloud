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
    
    /// Array of music genres associated with this artist
    var genres: [String]?
    
    /// URL to the artist's profile or promotional image
    var artworkUrl: String?
    
    /// Number of followers on the streaming service
    var followerCount: Int?
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
        guard let genres = genres, !genres.isEmpty else { return nil }
        return genres.joined(separator: ", ")
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
