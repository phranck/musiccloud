import Foundation

// MARK: - ConversionEntry

/// Represents a successful URL conversion from a streaming service to musiccloud.
///
/// `ConversionEntry` stores all information about a converted URL including
/// the original URL, short URL, metadata (track/album/artist info), and artwork.
/// Each entry is uniquely identified and can be persisted for history tracking.
///
/// ## Storage
///
/// Entries are automatically managed by ``HistoryManager`` and displayed
/// in the conversion history UI. They conform to `Codable` for persistence
/// and `Identifiable` for use in SwiftUI lists.
///
/// ## Topics
///
/// ### Creating an Entry
/// - ``init(id:originalUrl:shortUrl:contentType:track:album:artist:artworkImageData:date:)``
///
/// ### Properties
/// - ``id``
/// - ``originalUrl``
/// - ``shortUrl``
/// - ``contentType``
/// - ``track``
/// - ``album``
/// - ``artist``
/// - ``artworkImageData``
/// - ``date``
struct ConversionEntry: Codable, Identifiable, Equatable {
    
    /// Unique identifier for this conversion entry
    let id: UUID
    
    /// The original streaming service URL that was converted
    var originalUrl: String
    
    /// The shortened musiccloud.io URL
    var shortUrl: String
    
    /// The type of content (track, album, or artist)
    var contentType: ContentType
    
    /// Track metadata if this is a track URL
    var track: TrackInfo?
    
    /// Album metadata if this is an album URL
    var album: AlbumInfo?
    
    /// Artist metadata if this is an artist URL
    var artist: ArtistInfo?
    
    /// Downloaded artwork image data in PNG or JPEG format
    var artworkImageData: Data?
    
    /// Timestamp when this conversion was created
    var date: Date

    /// Creates a new conversion entry.
    ///
    /// - Parameters:
    ///   - id: Unique identifier (default: auto-generated UUID)
    ///   - originalUrl: The source streaming URL
    ///   - shortUrl: The generated musiccloud.io URL
    ///   - contentType: Type of content (default: `.track`)
    ///   - track: Track metadata if available
    ///   - album: Album metadata if available
    ///   - artist: Artist metadata if available
    ///   - artworkImageData: Downloaded artwork data
    ///   - date: Creation timestamp (default: current time)
    init(
        id: UUID = UUID(),
        originalUrl: String,
        shortUrl: String,
        contentType: ContentType = .track,
        track: TrackInfo? = nil,
        album: AlbumInfo? = nil,
        artist: ArtistInfo? = nil,
        artworkImageData: Data? = nil,
        date: Date = .now
    ) {
        self.id = id
        self.originalUrl = originalUrl
        self.shortUrl = shortUrl
        self.contentType = contentType
        self.track = track
        self.album = album
        self.artist = artist
        self.artworkImageData = artworkImageData
        self.date = date
    }
}

// MARK: - ContentType

/// Defines the type of music content represented by a URL.
///
/// Content types determine what kind of metadata is available and how
/// the content should be displayed in the UI.
///
/// ## Topics
///
/// ### Cases
/// - ``track``
/// - ``album``
/// - ``artist``
enum ContentType: String, Codable {
    
    /// A single music track or song
    case track
    
    /// An album or EP containing multiple tracks
    case album
    
    /// A music artist or band
    case artist
}

// MARK: - TrackInfo

/// Metadata information for a music track.
///
/// Contains all relevant information about a track including title, artists,
/// album name, artwork, and duration. Used when displaying track details in the UI.
///
/// ## Topics
///
/// ### Properties
/// - ``title``
/// - ``artists``
/// - ``albumName``
/// - ``artworkUrl``
/// - ``durationMs``
///
/// ### Computed Properties
/// - ``artistsString``
/// - ``formattedDuration``
struct TrackInfo: Codable, Equatable {
    
    /// The track's title or song name
    var title: String
    
    /// Array of artist names contributing to this track
    var artists: [String]
    
    /// The name of the album this track belongs to (if available)
    var albumName: String?
    
    /// URL to the track's artwork image
    var artworkUrl: String?
    
    /// Track duration in milliseconds
    var durationMs: Int?
}

extension TrackInfo {
    
    /// Returns all artists joined as a comma-separated string.
    ///
    /// ## Example
    /// ```swift
    /// let track = TrackInfo(title: "Song", artists: ["Artist 1", "Artist 2"])
    /// print(track.artistsString) // "Artist 1, Artist 2"
    /// ```
    var artistsString: String {
        artists.joined(separator: ", ")
    }

    /// Returns the duration formatted as "M:SS" (e.g., "3:45").
    ///
    /// - Returns: Formatted duration string, or `nil` if duration is not available
    var formattedDuration: String? {
        guard let ms = durationMs else { return nil }
        let total = ms / 1000
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

// MARK: - AlbumInfo

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

// MARK: - ArtistInfo

/// Metadata information for a music artist.
///
/// Contains all relevant information about an artist including name, genres,
/// artwork, and follower count.
///
/// ## Topics
///
/// ### Properties
/// - ``name``
/// - ``genres``
/// - ``artworkUrl``
/// - ``followerCount``
///
/// ### Computed Properties
/// - ``genresString``
/// - ``formattedFollowers``
struct ArtistInfo: Codable, Equatable {
    
    /// The artist's name
    var name: String
    
    /// Array of music genres associated with this artist
    var genres: [String]?
    
    /// URL to the artist's profile or promotional image
    var artworkUrl: String?
    
    /// Number of followers on the streaming service
    var followerCount: Int?
}

extension ArtistInfo {
    
    /// Returns all genres joined as a comma-separated string.
    ///
    /// - Returns: Formatted genre string, or `nil` if no genres are available
    ///
    /// ## Example
    /// ```swift
    /// let artist = ArtistInfo(name: "Artist", genres: ["Pop", "Rock"])
    /// print(artist.genresString) // "Pop, Rock"
    /// ```
    var genresString: String? {
        guard let genres = genres, !genres.isEmpty else { return nil }
        return genres.joined(separator: ", ")
    }
    
    /// Returns the follower count formatted with K/M suffixes.
    ///
    /// - Returns: Formatted follower string (e.g., "1.5M", "42.3K"), or `nil` if count is unavailable
    ///
    /// ## Examples
    /// - 1,234 → "1.2K"
    /// - 1,234,567 → "1.2M"
    /// - 42 → "42"
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

// MARK: - API Decodable Types

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

/// Error response from the musiccloud.io API.
///
/// Contains error code and human-readable message when an API request fails.
///
/// ## Topics
///
/// ### Properties
/// - ``error``
/// - ``message``
struct APIError: Decodable {
    
    /// Machine-readable error code (e.g., "INVALID_URL", "RATE_LIMITED")
    var error: String
    
    /// Human-readable error message
    var message: String
}

// MARK: - ResolveError

/// Errors that can occur when resolving a streaming URL.
///
/// Provides localized error descriptions for display to users.
/// Each error case maps to a specific failure scenario in the URL resolution process.
///
/// ## Topics
///
/// ### Error Cases
/// - ``rateLimited``
/// - ``invalidURL``
/// - ``networkError``
/// - ``serviceDown``
/// - ``httpError(_:)``
/// - ``unknown(_:)``
///
/// ### Error Description
/// - ``errorDescription``
enum ResolveError: LocalizedError {
    
    /// Request was rate-limited by the API (HTTP 429)
    case rateLimited
    
    /// The provided URL is not a valid streaming service URL
    case invalidURL
    
    /// Network connection failed
    case networkError
    
    /// The musiccloud.io service is currently unavailable
    case serviceDown
    
    /// HTTP error with specific status code
    /// - Parameter code: The HTTP status code
    case httpError(Int)
    
    /// Unknown error with custom message
    /// - Parameter message: Description of the error
    case unknown(String)
}

extension ResolveError {
    
    /// Returns a localized, user-friendly error description.
    ///
    /// Error messages are localized using the app's `Localizable.strings` file.
    var errorDescription: String? {
        switch self {
        case .rateLimited:       String(localized: "error.rate_limited")
        case .invalidURL:        String(localized: "error.invalid_url")
        case .networkError:      String(localized: "error.network")
        case .serviceDown:       String(localized: "error.service_down")
        case .httpError(let c):  "\(String(localized: "error.server")) (\(c))"
        case .unknown(let msg):  msg
        }
    }
}

