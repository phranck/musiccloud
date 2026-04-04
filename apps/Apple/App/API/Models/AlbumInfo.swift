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
/// - ``name``
/// - ``artists``
/// - ``releaseDate``
/// - ``totalTracks``
/// - ``artworkUrl``
///
/// ### Computed Properties
/// - ``artistsString``
struct AlbumInfo: Codable, Equatable {
    
    /// The album's name or title
    var name: String
    
    /// Array of artist names who created this album
    var artists: [String]
    
    /// The album's release date (format may vary by service)
    var releaseDate: String?
    
    /// Total number of tracks in the album
    var totalTracks: Int?
    
    /// URL to the album's cover artwork image
    var artworkUrl: String?
}

extension AlbumInfo {
    
    /// Returns all artists joined as a comma-separated string.
    ///
    /// ## Example
    /// ```swift
    /// let album = AlbumInfo(name: "Album", artists: ["Artist 1", "Artist 2"])
    /// print(album.artistsString) // "Artist 1, Artist 2"
    /// ```
    var artistsString: String {
        artists.joined(separator: ", ")
    }
}
