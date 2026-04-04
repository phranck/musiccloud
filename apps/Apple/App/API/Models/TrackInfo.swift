//
//  TrackInfo.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//


/// Metadata information for a music track.
///
/// Contains all relevant information about a track including title, artists,
/// album name, artwork, and duration. Used when displaying track details in the UI.
///
/// ## Topics
///
/// ### Properties
/// - ``title``
/// - ``artists``
/// - ``albumName``
/// - ``artworkUrl``
/// - ``durationMs``
///
/// ### Computed Properties
/// - ``artistsString``
/// - ``formattedDuration``
struct TrackInfo: Codable, Equatable {
    
    /// The track's title or song name
    var title: String
    
    /// Array of artist names contributing to this track
    var artists: [String]
    
    /// The name of the album this track belongs to (if available)
    var albumName: String?
    
    /// URL to the track's artwork image
    var artworkUrl: String?
    
    /// Track duration in milliseconds
    var durationMs: Int?
}

extension TrackInfo {
    
    /// Returns all artists joined as a comma-separated string.
    ///
    /// ## Example
    /// ```swift
    /// let track = TrackInfo(title: "Song", artists: ["Artist 1", "Artist 2"])
    /// print(track.artistsString) // "Artist 1, Artist 2"
    /// ```
    var artistsString: String {
        artists.joined(separator: ", ")
    }

    /// Returns the duration formatted as "M:SS" (e.g., "3:45").
    ///
    /// - Returns: Formatted duration string, or `nil` if duration is not available
    var formattedDuration: String? {
        guard let ms = durationMs else { return nil }
        let total = ms / 1000
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
