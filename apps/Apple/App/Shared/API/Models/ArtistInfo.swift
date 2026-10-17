//
//  ArtistInfo.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import Foundation

/// Metadata information for a music artist.
struct ArtistInfo: Codable, Equatable {
    var name: String
    var genres: [String]?
    var artworkUrl: String?
    var followerCount: Int?

    private enum CodingKeys: String, CodingKey {
        case name, genres
        case artworkUrl = "imageUrl"
        case followerCount
    }
}

// MARK: - Public API

extension ArtistInfo {
    var genresString: String? {
        guard let genres = genres, !genres.isEmpty else { return nil }
        return genres.joined(separator: ", ")
    }

    /// The follower count in the user's locale, shortened for the media
    /// card, such as `1.5M` in English.
    var formattedFollowers: String? { formattedFollowers(locale: .current) }

    /// The follower count shortened with the locale's compact names and at
    /// most one decimal, or `nil` without a count.
    ///
    /// - Parameter locale: The locale that decides the abbreviations and
    ///   separators. German, for example, shortens only from a million on.
    func formattedFollowers(locale: Locale) -> String? {
        guard let count = followerCount else { return nil }
        return count.formatted(.number.notation(.compactName).precision(.fractionLength(0...1)).locale(locale))
    }
}
