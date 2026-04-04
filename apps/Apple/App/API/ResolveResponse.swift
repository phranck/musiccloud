//
//  ResolveResponse.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

/// Response from the musiccloud.io resolve API endpoint.
///
/// The API returns separate optional fields for track, album, and artist.
/// The computed ``contentType`` property maps these into a ``ContentType``
/// with associated values.
struct ResolveResponse: Decodable {

    /// The shortened musiccloud.io URL
    var shortUrl: String

    /// Track metadata if the URL was for a track
    var track: TrackInfo?

    /// Album metadata if the URL was for an album
    var album: AlbumInfo?

    /// Artist metadata if the URL was for an artist
    var artist: ArtistInfo?

    /// Derives the ``ContentType`` from the populated metadata field.
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
}
