#if os(macOS)
//
//  NativeAppLink.swift
//  musiccloud
//

import AppKit

// MARK: - NativeAppLink

/// Turns a streaming service's web link into the link its Mac app opens.
///
/// macOS hands every `https` URL to the default browser. The desktop apps
/// answer only their own schemes: Spotify registers `spotify`, and Music
/// registers `music` among the iTunes schemes. Services whose desktop scheme
/// is not verified keep their web link.
enum NativeAppLink {
    /// The link a desktop app opens for `webURL`, or `nil` when there is none.
    static func appURL(for webURL: URL) -> URL? {
        switch webURL.host()?.lowercased() {
        case "open.spotify.com": spotifyURI(for: webURL)
        case "music.apple.com": appleMusicURL(for: webURL)
        default: nil
        }
    }

    /// The URL to open for a service link: the app link when an installed
    /// app answers its scheme, otherwise the web link.
    static func preferredURL(for webURL: URL) -> URL {
        guard let appURL = appURL(for: webURL),
              NSWorkspace.shared.urlForApplication(toOpen: appURL) != nil
        else { return webURL }
        return appURL
    }
}

private extension NativeAppLink {
    /// The Spotify item kinds whose web path is `/<kind>/<id>`.
    static let spotifyKinds: Set<String> = ["track", "album", "artist", "playlist"]

    /// `https://open.spotify.com/intl-de/track/<id>?si=...` becomes
    /// `spotify:track:<id>`. The locale prefix and the share parameters
    /// do not belong to the item.
    static func spotifyURI(for webURL: URL) -> URL? {
        let parts = webURL.pathComponents.filter { $0 != "/" && !$0.hasPrefix("intl-") }
        guard parts.count >= 2,
              spotifyKinds.contains(parts[0]),
              parts[1].allSatisfy({ $0.isLetter || $0.isNumber })
        else { return nil }
        return URL(string: "spotify:\(parts[0]):\(parts[1])")
    }

    /// `https://music.apple.com/...` becomes `music://music.apple.com/...`,
    /// which Music opens at the same item.
    static func appleMusicURL(for webURL: URL) -> URL? {
        guard var components = URLComponents(url: webURL, resolvingAgainstBaseURL: false) else { return nil }
        components.scheme = "music"
        return components.url
    }
}

#endif
