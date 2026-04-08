//
//  AlbumInfo.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

/// Metadata information for a music album.
///
/// Contains all relevant information about an album including name, artists,
/// release date, track count, and artwork.
///
/// ## Topics
///
/// ### Properties
/// - ``title``
/// - ``artists``
/// - ``releaseDate``
/// - ``totalTracks``
/// - ``artworkUrl``
///
/// ### Computed Properties
/// - ``artistsString``
struct AlbumInfo: Codable, Equatable {

    /// The album's title
    var title: String

    /// Comma-separated artist names (stored as String for CloudKit compatibility)
    var artistsRaw: String

    /// The album's release date (format may vary by service)
    var releaseDate: String?

    /// Total number of tracks in the album
    var totalTracks: Int?

    /// URL to the album's cover artwork image
    var artworkUrl: String?

    /// Array accessor for artist names.
    var artists: [String] {
        artistsRaw.isEmpty ? [] : artistsRaw.components(separatedBy: ", ")
    }

    init(title: String, artists: [String], releaseDate: String? = nil, totalTracks: Int? = nil, artworkUrl: String? = nil) {
        self.title = title
        self.artistsRaw = artists.joined(separator: ", ")
        self.releaseDate = releaseDate
        self.totalTracks = totalTracks
        self.artworkUrl = artworkUrl
    }

    /// Decodes from API JSON where `"artists"` is `[String]`.
    static func fromJSON(_ decoder: Decoder) throws -> AlbumInfo {
        let c = try decoder.container(keyedBy: JSONKeys.self)
        return AlbumInfo(
            title: try c.decode(String.self, forKey: .title),
            artists: try c.decode([String].self, forKey: .artists),
            releaseDate: try c.decodeIfPresent(String.self, forKey: .releaseDate),
            totalTracks: try c.decodeIfPresent(Int.self, forKey: .totalTracks),
            artworkUrl: try c.decodeIfPresent(String.self, forKey: .artworkUrl)
        )
    }

    private enum JSONKeys: String, CodingKey {
        case title, artists, releaseDate, totalTracks, artworkUrl
    }
}

extension AlbumInfo {

    /// Returns all artists joined as a comma-separated string.
    ///
    /// ## Example
    /// ```swift
    /// let album = AlbumInfo(title: "Album", artists: ["Artist 1", "Artist 2"])
    /// print(album.artistsString) // "Artist 1, Artist 2"
    /// ```
    var artistsString: String {
        artistsRaw
    }

    /// Returns the four-digit release year extracted from ``releaseDate``.
    var releaseYear: String? {
        guard let date = releaseDate, date.count >= 4 else { return nil }
        return String(date.prefix(4))
    }
}
