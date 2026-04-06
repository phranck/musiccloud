//
//  ServiceLink.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

/// A resolved link to a specific streaming service.
///
/// Maps to the `ApiLink` type from the backend API response.
/// Only `service`, `displayName`, and `url` are stored -- confidence
/// and match method are not needed in the client.
struct ServiceLink: Codable, Equatable {

    /// Machine-readable service identifier (e.g., "spotify", "applemusic", "deezer")
    var service: String

    /// Human-readable service name (e.g., "Spotify", "Apple Music", "Deezer")
    var displayName: String

    /// Direct URL to the track/album on this service
    var url: String
}
