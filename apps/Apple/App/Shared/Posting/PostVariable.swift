//
//  PostVariable.swift
//  musiccloud
//

import Foundation

// MARK: - PostContext

/// The metadata of one history entry, as the values a template can use.
///
/// It is a value copied out of a ``MediaEntry``, so rendering does not
/// touch the SwiftData model and can be tested without a store.
struct PostContext: Sendable, Equatable {
    var track: TrackInfo?
    var album: AlbumInfo?
    var artist: ArtistInfo?
    var shareURL: String
    var originalURL: String
    var serviceLinks: [ServiceLink]
}

extension PostContext {
    /// The context of a history entry.
    init(entry: MediaEntry) {
        self.init(
            track: entry.track,
            album: entry.album,
            artist: entry.artist,
            shareURL: entry.shortUrl,
            originalURL: entry.originalUrl,
            serviceLinks: entry.serviceLinks
        )
    }

    /// What the entry is called: its song, else its album, else its artist.
    var title: String {
        [PostVariable.songName, .albumName, .artist].lazy.compactMap { $0.value(in: self) }.first ?? ""
    }
}

// MARK: - PostVariable

/// A metadata field a template can place with `{token}`.
///
/// Links to the individual services are not listed here, because which
/// services an entry has comes from the backend. They are written
/// `{<service>_url}`, for example `{spotify_url}`, and resolved from the
/// entry's service links.
enum PostVariable: String, CaseIterable, Identifiable, Sendable {
    case songName = "song_name"
    case albumName = "album_name"
    case artist
    case releaseDate = "release_date"
    case releaseYear = "release_year"
    case duration
    case trackCount = "track_count"
    case genres
    case shareURL = "share_url"
    case originalURL = "original_url"

    var id: String { rawValue }

    /// The placeholder as it is written in a template.
    var token: String { "{\(rawValue)}" }

    /// The name shown in the variable menu.
    var title: String {
        switch self {
        case .songName:    String(localized: "Song Name")
        case .albumName:   String(localized: "Album Name")
        case .artist:      String(localized: "Artist")
        case .releaseDate: String(localized: "Release Date")
        case .releaseYear: String(localized: "Release Year")
        case .duration:    String(localized: "Duration")
        case .trackCount:  String(localized: "Track Count")
        case .genres:      String(localized: "Genres")
        case .shareURL:    String(localized: "Share Link")
        case .originalURL: String(localized: "Original Link")
        }
    }

    /// The value for `context`, or `nil` when the entry has none.
    func value(in context: PostContext) -> String? {
        let text: String? = switch self {
        case .songName:    context.track?.title
        case .albumName:   context.track?.albumName ?? context.album?.title
        case .artist:      context.track?.artistsString ?? context.album?.artistsString ?? context.artist?.name
        case .releaseDate: context.track?.releaseDate ?? context.album?.releaseDate
        case .releaseYear: (context.track?.releaseDate ?? context.album?.releaseDate).map { String($0.prefix(4)) }
        case .duration:    context.track?.formattedDuration
        case .trackCount:  context.album?.totalTracks.map(String.init)
        case .genres:      context.artist?.genresString
        case .shareURL:    context.shareURL
        case .originalURL: context.originalURL
        }
        guard let text, !text.isEmpty else { return nil }
        return text
    }
}
