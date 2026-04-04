//
//  ResolveResponse.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//


/// Response from the musiccloud.io resolve API endpoint.
///
/// Contains the shortened URL and optional metadata for the resolved content.
/// The API may return track, album, or artist information depending on the
/// original URL type.
///
/// ## Topics
///
/// ### Properties
/// - ``shortUrl``
/// - ``contentType``
/// - ``track``
/// - ``album``
/// - ``artist``
struct ResolveResponse: Decodable {
    
    /// The shortened musiccloud.io URL
    var shortUrl: String
    
    /// Type of content that was resolved (track, album, or artist)
    var contentType: ContentType?
    
    /// Track metadata if the URL was for a track
    var track: TrackInfo?
    
    /// Album metadata if the URL was for an album
    var album: AlbumInfo?
    
    /// Artist metadata if the URL was for an artist
    var artist: ArtistInfo?
}
