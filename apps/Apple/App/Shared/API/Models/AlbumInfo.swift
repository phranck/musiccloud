//
//  AlbumInfo.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

/// Metadata information for a music album.
struct AlbumInfo: Codable, Equatable {
    var title: String
    var artists: [String]
    var releaseDate: String?
    var totalTracks: Int?
    var artworkUrl: String?
}

// MARK: - Public API

extension AlbumInfo {
    var artistsString: String {
        artists.joined(separator: ", ")
    }

    var releaseYear: String? {
        guard let date = releaseDate, date.count >= 4 else { return nil }
        return String(date.prefix(4))
    }
}
