import Foundation

// MARK: - StreamingServices

/// Identifies and validates URLs from supported music streaming services.
///
/// `StreamingServices` provides domain-based detection for the streaming
/// platforms listed in ``all``, such as Spotify, Apple Music, YouTube Music,
/// Tidal, and many others. It uses both exact domain matching and suffix
/// matching for platforms with variable subdomains.
///
/// A service the user switched off in Settings is listed in ``all`` like any
/// other, but ``isStreamingURL(_:defaults:)`` skips its domains, so a disabled
/// service is treated the same as a domain the app never supported.
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
/// - ``isStreamingURL(_:defaults:)``
///
/// ### Services
/// - ``Service``
/// - ``all``
/// - ``allSortedByDisplayName``
/// - ``isEnabled(_:defaults:)``
/// - ``setEnabled(_:for:defaults:)``
enum StreamingServices {

    /// One streaming service this app can detect, with the domains that identify it.
    struct Service: Identifiable, Hashable {
        /// Stable identifier, persisted when the user turns this service off in Settings.
        ///
        /// Never renamed once shipped: renaming it would silently turn a
        /// disabled service back on for everyone who had turned it off.
        let id: String

        /// The name shown in Settings.
        let displayName: String

        /// Fully-qualified domains that must match exactly.
        let exactDomains: Set<String>

        /// Domain suffixes that match any subdomain, such as `artist.bandcamp.com`.
        let suffixDomains: [String]

        /// The shared platform identifier used by bundled brand metadata.
        var brandingID: String {
            switch id {
            case "appleMusic": "apple-music"
            case "neteaseCloudMusic": "netease"
            case "qqMusic": "qqmusic"
            default: id
            }
        }

        /// The bundled silhouette, retaining a consistent optical frame across brands.
        var iconAssetName: String {
            let assetID = ["netease", "boomplay"].contains(brandingID) ? "\(brandingID)-settings" : brandingID
            return "ServiceIcons/\(assetID)"
        }

        /// The color asset generated from the repository's canonical platform palette.
        var brandColorAssetName: String { "ServiceColors/\(brandingID)" }

        /// Creates the stable identity and host patterns used by detection and Settings.
        /// - Parameters:
        ///   - id: The persisted identifier; keep it unchanged after release.
        ///   - displayName: The service's brand name shown to the user.
        ///   - exactDomains: Complete lowercase hosts accepted without subdomain expansion.
        ///   - suffixDomains: Leading-dot suffixes accepting both the base host and its subdomains.
        init(id: String, displayName: String, exactDomains: Set<String>, suffixDomains: [String] = []) {
            self.id = id
            self.displayName = displayName
            self.exactDomains = exactDomains
            self.suffixDomains = suffixDomains
        }

        /// Whether `host` belongs to this service.
        fileprivate func matches(host: String) -> Bool {
            if exactDomains.contains(host) { return true }
            return suffixDomains.contains { host.hasSuffix($0) || host == String($0.dropFirst()) }
        }
    }

    /// Every streaming service this app can detect. ``allSortedByDisplayName``
    /// is what Settings lists, since this array's order is just declaration order.
    static let all: [Service] = [
        Service(id: "spotify", displayName: "Spotify", exactDomains: ["open.spotify.com", "play.spotify.com"]),
        Service(id: "appleMusic", displayName: "Apple Music", exactDomains: ["music.apple.com"]),
        Service(
            id: "youtube",
            displayName: "YouTube / YouTube Music",
            exactDomains: ["youtube.com", "www.youtube.com", "youtu.be", "music.youtube.com"]
        ), Service(id: "soundcloud", displayName: "SoundCloud", exactDomains: ["soundcloud.com", "www.soundcloud.com"]),
        Service(id: "tidal", displayName: "Tidal", exactDomains: ["tidal.com", "www.tidal.com", "listen.tidal.com"]),
        Service(id: "deezer", displayName: "Deezer", exactDomains: ["deezer.com", "www.deezer.com"]),
        Service(id: "audius", displayName: "Audius", exactDomains: ["audius.co"]),
        Service(id: "napster", displayName: "Napster", exactDomains: ["napster.com", "play.napster.com", "web.napster.com"]),
        Service(id: "pandora", displayName: "Pandora", exactDomains: ["pandora.com", "www.pandora.com"]),
        Service(id: "qobuz", displayName: "Qobuz", exactDomains: ["open.qobuz.com", "play.qobuz.com"]),
        Service(id: "boomplay", displayName: "Boomplay", exactDomains: ["boomplay.com", "www.boomplay.com"]),
        Service(id: "kkbox", displayName: "KKBOX", exactDomains: ["kkbox.com", "www.kkbox.com"]),
        Service(id: "audiomack", displayName: "Audiomack", exactDomains: ["audiomack.com", "www.audiomack.com"]),
        Service(id: "neteaseCloudMusic", displayName: "NetEase Cloud Music", exactDomains: ["music.163.com"]),
        Service(id: "qqMusic", displayName: "QQ Music", exactDomains: ["y.qq.com"]),
        Service(id: "melon", displayName: "Melon", exactDomains: ["melon.com", "www.melon.com"]),
        Service(id: "bugs", displayName: "Bugs", exactDomains: ["music.bugs.co.kr"]),
        Service(id: "jiosaavn", displayName: "JioSaavn", exactDomains: ["jiosaavn.com", "www.jiosaavn.com"]),
        Service(id: "beatport", displayName: "Beatport", exactDomains: ["beatport.com", "www.beatport.com"]),
        Service(id: "bandcamp", displayName: "Bandcamp", exactDomains: [], suffixDomains: [".bandcamp.com"]),
    ]

    /// ``all``, sorted by ``Service/displayName`` for Settings.
    static var allSortedByDisplayName: [Service] {
        all.sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
    }
}

// MARK: - Enabled Services

extension StreamingServices {
    /// Whether `service` currently takes part in URL detection. Defaults to `true`.
    /// - Parameters:
    ///   - service: The stable service whose persisted choice is read.
    ///   - defaults: Shared app-group preferences, or a private suite owned by a test.
    /// - Returns: Whether this preference store allows detecting the service's URLs.
    static func isEnabled(_ service: Service, defaults: UserDefaults = DefaultsKey.shared) -> Bool {
        !disabledServiceIDs(in: defaults).contains(service.id)
    }

    /// Turns `service` on or off for URL detection without changing other services.
    /// - Parameters:
    ///   - isEnabled: Whether the service participates in URL detection.
    ///   - service: The service whose stable ID is persisted.
    ///   - defaults: Shared app-group preferences, or a private suite owned by a test.
    static func setEnabled(_ isEnabled: Bool, for service: Service, defaults: UserDefaults = DefaultsKey.shared) {
        var ids = disabledServiceIDs(in: defaults)
        if isEnabled { ids.remove(service.id) } else { ids.insert(service.id) }
        defaults.set(Array(ids), forKey: DefaultsKey.disabledStreamingServices)
    }
}

extension StreamingServices {
    /// Whether every supported service is enabled in the supplied preference store.
    /// - Parameter defaults: Shared preferences, or an isolated test store.
    static func allEnabled(defaults: UserDefaults = DefaultsKey.shared) -> Bool { all.allSatisfy { isEnabled($0, defaults: defaults) } }

    /// Persists one choice for every supported service without changing unknown IDs.
    /// - Parameters:
    ///   - isEnabled: Whether all supported services should participate in detection.
    ///   - defaults: Shared preferences, or an isolated test store.
    static func setAllEnabled(_ isEnabled: Bool, defaults: UserDefaults = DefaultsKey.shared) {
        var ids = disabledServiceIDs(in: defaults)
        let supportedIDs = Set(all.map(\.id))
        if isEnabled { ids.subtract(supportedIDs) } else { ids.formUnion(supportedIDs) }
        defaults.set(ids.sorted(), forKey: DefaultsKey.disabledStreamingServices)
    }
}

// MARK: - URL Matching

extension StreamingServices {

    /// Determines if a URL string belongs to a supported, enabled streaming service.
    ///
    /// Validates the URL by checking its domain against the enabled entries
    /// in ``all``. Performs both exact domain matching and suffix matching
    /// for services with variable subdomains.
    ///
    /// - Parameters:
    ///   - urlString: The URL string to validate.
    ///   - defaults: Shared service choices, or an isolated store supplied by a test.
    /// - Returns: `true` if the URL belongs to a supported streaming service that is currently enabled, `false` otherwise
    ///
    /// ## Validation Process
    ///
    /// 1. Checks URL length (must be ≤ 500 characters)
    /// 2. Parses the URL to extract the host/domain
    /// 3. Normalizes the host to lowercase
    /// 4. Checks the host against every enabled service's domains
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
    /// - Note: Returns `false` for malformed URLs, excessively long strings, URLs without a valid host, or a host whose service is disabled.
    static func isStreamingURL(_ urlString: String, defaults: UserDefaults = DefaultsKey.shared) -> Bool {
        guard
            urlString.count <= 500,
            let host = webURL(urlString)?.host?.lowercased()
        else {
            return false
        }
        return all.contains { isEnabled($0, defaults: defaults) && $0.matches(host: host) }
    }

    /// Extracts the streaming URL from `musiccloud://resolve?url=<streaming URL>`.
    ///
    /// Any app or web page can open this link without asking the user, so the
    /// parameter is returned only when it passes ``isStreamingURL(_:defaults:)``, the
    /// same check the clipboard and the paste button apply.
    ///
    /// - Parameters:
    ///   - url: The URL the app was opened with.
    ///   - defaults: The same service choices used by direct URL detection.
    /// - Returns: The streaming URL to resolve, or `nil` when the link is anything else.
    static func streamingURL(fromDeepLink url: URL, defaults: UserDefaults = DefaultsKey.shared) -> String? {
        guard
            url.scheme == "musiccloud",
            url.host == "resolve",
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
            let parameter = components.queryItems?.first(where: { $0.name == "url" })?.value,
            isStreamingURL(parameter, defaults: defaults)
        else {
            return nil
        }
        return parameter
    }

    /// Parses a string as a web address, and nothing else.
    ///
    /// Every URL the app opens, shares or downloads from comes from the
    /// clipboard, another app or the backend. Passing such a string to
    /// `NSWorkspace.open` or `openURL` unchecked would let it name a file, a
    /// phone number or another app's custom scheme. Only `http` and `https`
    /// with a host pass.
    ///
    /// - Parameter string: The address to parse.
    /// - Returns: The URL, or `nil` when the string is not an `http` or `https` address with a host.
    static func webURL(_ string: String) -> URL? {
        guard
            let url = URL(string: string),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http",
            url.host?.isEmpty == false
        else {
            return nil
        }
        return url
    }
}

private extension StreamingServices {
    /// Reads the IDs of services the user turned off in Settings.
    /// Production uses the shared app group, so the app, Share Extension and Shortcuts agree.
    /// - Parameter defaults: The preference domain to read, isolated per mutating test.
    /// - Returns: Persisted disabled IDs, or an empty set before the first choice.
    static func disabledServiceIDs(in defaults: UserDefaults) -> Set<String> {
        Set(defaults.stringArray(forKey: DefaultsKey.disabledStreamingServices) ?? [])
    }
}
