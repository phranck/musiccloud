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

    private enum CodingKeys: String, CodingKey {
        case title, artistsRaw = "artists", releaseDate, totalTracks, artworkUrl
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decode(String.self, forKey: .title)
        let artistArray = try container.decode([String].self, forKey: .artistsRaw)
        artistsRaw = artistArray.joined(separator: ", ")
        releaseDate = try container.decodeIfPresent(String.self, forKey: .releaseDate)
        totalTracks = try container.decodeIfPresent(Int.self, forKey: .totalTracks)
        artworkUrl = try container.decodeIfPresent(String.self, forKey: .artworkUrl)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(artists, forKey: .artistsRaw)
        try container.encodeIfPresent(releaseDate, forKey: .releaseDate)
        try container.encodeIfPresent(totalTracks, forKey: .totalTracks)
        try container.encodeIfPresent(artworkUrl, forKey: .artworkUrl)
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
