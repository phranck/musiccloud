import Foundation

// MARK: - StreamingServices

/// Identifies and validates URLs from supported music streaming services.
///
/// `StreamingServices` provides domain-based detection for 25+ music streaming
/// platforms including Spotify, Apple Music, YouTube Music, Tidal, and many others.
/// It uses both exact domain matching and suffix matching for platforms with
/// variable subdomains.
///
/// ## Supported Services
///
/// ### Major Platforms
/// - Spotify (open.spotify.com, play.spotify.com)
/// - Apple Music (music.apple.com)
/// - YouTube Music (youtube.com, music.youtube.com, youtu.be)
/// - Tidal (tidal.com, listen.tidal.com)
/// - Deezer (deezer.com)
/// - SoundCloud (soundcloud.com)
///
/// ### Regional & Specialized
/// - Bandcamp (*.bandcamp.com)
/// - QQ Music (y.qq.com)
/// - NetEase Cloud Music (music.163.com)
/// - Melon (melon.com)
/// - JioSaavn (jiosaavn.com)
/// - And 15+ more services
///
/// ## Usage
///
/// ```swift
/// let spotifyURL = "https://open.spotify.com/track/..."
/// if StreamingServices.isStreamingURL(spotifyURL) {
///     // Valid streaming URL - can be converted
/// }
///
/// let invalidURL = "https://example.com"
/// if !StreamingServices.isStreamingURL(invalidURL) {
///     // Not a supported streaming service
/// }
/// ```
///
/// ## Topics
///
/// ### URL Validation
/// - ``isStreamingURL(_:)``
enum StreamingServices {

    /// Exact domain matches for streaming services.
    ///
    /// Contains fully-qualified domain names that must match exactly.
    /// Used for services with fixed, predictable domains.
    private static let exactDomains: Set<String> = [
        "open.spotify.com", "play.spotify.com",
        "music.apple.com",
        "youtube.com", "www.youtube.com", "youtu.be", "music.youtube.com",
        "soundcloud.com", "www.soundcloud.com",
        "tidal.com", "www.tidal.com", "listen.tidal.com",
        "deezer.com", "www.deezer.com",
        "audius.co",
        "napster.com", "play.napster.com", "web.napster.com",
        "pandora.com", "www.pandora.com",
        "open.qobuz.com", "play.qobuz.com",
        "boomplay.com", "www.boomplay.com",
        "kkbox.com", "www.kkbox.com",
        "audiomack.com", "www.audiomack.com",
        "music.163.com",
        "y.qq.com",
        "melon.com", "www.melon.com",
        "music.bugs.co.kr",
        "jiosaavn.com", "www.jiosaavn.com",
        "beatport.com", "www.beatport.com"
    ]

    /// Domain suffixes for services with variable subdomains.
    ///
    /// Contains domain patterns that match any subdomain.
    /// Used for services like Bandcamp where each artist has a unique subdomain
    /// (e.g., artist.bandcamp.com, band.bandcamp.com).
    private static let suffixDomains: [String] = [
        ".bandcamp.com"
    ]
}

// MARK: - URL Matching

extension StreamingServices {

    /// Determines if a URL string belongs to a supported streaming service.
    ///
    /// Validates the URL by checking its domain against known streaming services.
    /// Performs both exact domain matching and suffix matching for services with
    /// variable subdomains.
    ///
    /// - Parameter urlString: The URL string to validate
    /// - Returns: `true` if the URL belongs to a supported streaming service, `false` otherwise
    ///
    /// ## Validation Process
    ///
    /// 1. Checks URL length (must be ≤ 500 characters)
    /// 2. Parses the URL to extract the host/domain
    /// 3. Normalizes the host to lowercase
    /// 4. Checks against ``exactDomains`` set for exact matches
    /// 5. Checks against ``suffixDomains`` for suffix matches
    ///
    /// ## Examples
    ///
    /// ```swift
    /// // Valid streaming URLs
    /// StreamingServices.isStreamingURL("https://open.spotify.com/track/...")  // true
    /// StreamingServices.isStreamingURL("https://music.apple.com/us/album/...")  // true
    /// StreamingServices.isStreamingURL("https://artist.bandcamp.com/album/...")  // true
    ///
    /// // Invalid URLs
    /// StreamingServices.isStreamingURL("https://example.com")  // false
    /// StreamingServices.isStreamingURL("not a url")  // false
    /// StreamingServices.isStreamingURL(String(repeating: "x", count: 501))  // false (too long)
    /// ```
    ///
    /// ## Performance
    ///
    /// - Exact domain lookup: O(1) via `Set` membership test
    /// - Suffix matching: O(n) where n = number of suffix patterns (currently 1)
    /// - URL parsing overhead is minimal for valid URLs
    ///
    /// - Note: Returns `false` for malformed URLs, excessively long strings, or URLs without a valid host
    static func isStreamingURL(_ urlString: String) -> Bool {
        guard
            urlString.count <= 500,
            let url = URL(string: urlString),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http",
            let host = url.host?.lowercased()
        else { return false }

        if exactDomains.contains(host) { return true }
        return suffixDomains.contains { host.hasSuffix($0) || host == String($0.dropFirst()) }
    }
}
