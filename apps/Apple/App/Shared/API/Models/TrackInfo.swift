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

    /// Comma-separated artist names (stored as String for CloudKit compatibility)
    var artistsRaw: String

    /// The name of the album this track belongs to (if available)
    var albumName: String?

    /// URL to the track's artwork image
    var artworkUrl: String?

    /// Track duration in milliseconds
    var durationMs: Int?

    /// The track's release date (format varies by service, typically "YYYY-MM-DD")
    var releaseDate: String?

    /// Array accessor for artist names.
    var artists: [String] {
        artistsRaw.isEmpty ? [] : artistsRaw.components(separatedBy: ", ")
    }

    init(title: String, artists: [String], albumName: String? = nil, artworkUrl: String? = nil, durationMs: Int? = nil, releaseDate: String? = nil) {
        self.title = title
        self.artistsRaw = artists.joined(separator: ", ")
        self.albumName = albumName
        self.artworkUrl = artworkUrl
        self.durationMs = durationMs
        self.releaseDate = releaseDate
    }

    /// Decodes from API JSON where `"artists"` is `[String]`.
    static func fromJSON(_ decoder: Decoder) throws -> TrackInfo {
        let c = try decoder.container(keyedBy: JSONKeys.self)
        return TrackInfo(
            title: try c.decode(String.self, forKey: .title),
            artists: try c.decode([String].self, forKey: .artists),
            albumName: try c.decodeIfPresent(String.self, forKey: .albumName),
            artworkUrl: try c.decodeIfPresent(String.self, forKey: .artworkUrl),
            durationMs: try c.decodeIfPresent(Int.self, forKey: .durationMs),
            releaseDate: try c.decodeIfPresent(String.self, forKey: .releaseDate)
        )
    }

    private enum JSONKeys: String, CodingKey {
        case title, artists, albumName, artworkUrl, durationMs, releaseDate
    }
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
        artistsRaw
    }

    /// Returns the duration formatted as "M:SS" (e.g., "3:45").
    ///
    /// - Returns: Formatted duration string, or `nil` if duration is not available
    var formattedDuration: String? {
        guard let millis = durationMs else { return nil }
        let total = millis / 1000
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// Returns the four-digit release year extracted from ``releaseDate``.
    var releaseYear: String? {
        guard let date = releaseDate, date.count >= 4 else { return nil }
        return String(date.prefix(4))
    }
}
