//
//  TrackInfo.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

/// Metadata information for a music track.
struct TrackInfo: Codable, Equatable {
    var title: String
    var artists: [String]
    var albumName: String?
    var artworkUrl: String?
    var durationMs: Int?
    var releaseDate: String?
}

// MARK: - Public API

extension TrackInfo {
    var artistsString: String {
        artists.joined(separator: ", ")
    }

    var formattedDuration: String? {
        guard let millis = durationMs else { return nil }
        let total = millis / 1000
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    var releaseYear: String? {
        guard let date = releaseDate, date.count >= 4 else { return nil }
        return String(date.prefix(4))
    }
}
