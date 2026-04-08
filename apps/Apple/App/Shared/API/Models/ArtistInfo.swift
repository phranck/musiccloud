//
//  ArtistInfo.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

/// Metadata information for a music artist.
struct ArtistInfo: Codable, Equatable {
    var name: String
    var genres: [String]?
    var artworkUrl: String?
    var followerCount: Int?
}

// MARK: - Public API

extension ArtistInfo {
    var genresString: String? {
        guard let genres = genres, !genres.isEmpty else { return nil }
        return genres.joined(separator: ", ")
    }

    var formattedFollowers: String? {
        guard let count = followerCount else { return nil }
        if count >= 1_000_000 {
            return String(format: "%.1fM", Double(count) / 1_000_000)
        } else if count >= 1_000 {
            return String(format: "%.1fK", Double(count) / 1_000)
        } else {
            return "\(count)"
        }
    }
}
