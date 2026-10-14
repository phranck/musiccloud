//
//  PostTemplateIcon.swift
//  musiccloud
//

import Foundation

// MARK: - PostTemplateIcon

/// The icon a post template can show in lists and in the composer.
///
/// The Mastodon and Bluesky logos are the networks' own marks, taken
/// unmodified from their brand kits and drawn as template images in the
/// text color. The other icons are SF Symbols for templates that are not
/// tied to one network.
enum PostTemplateIcon: String, Codable, CaseIterable, Identifiable, Sendable {
    case mastodon
    case bluesky
    case note
    case album
    case megaphone
    case star
    case heart

    var id: String { rawValue }

    /// The name shown in the icon picker.
    var title: String {
        switch self {
        case .mastodon:  "Mastodon"
        case .bluesky:   "Bluesky"
        case .note:      String(localized: "Note")
        case .album:     String(localized: "Album")
        case .megaphone: String(localized: "Megaphone")
        case .star:      String(localized: "Star")
        case .heart:     String(localized: "Heart")
        }
    }

    /// Where the image comes from: an asset in the catalog or an SF Symbol.
    enum Source: Equatable {
        case asset(String)
        case symbol(String)
    }

    var source: Source {
        switch self {
        case .mastodon:  .asset("SocialIcons/mastodon")
        case .bluesky:   .asset("SocialIcons/bluesky")
        case .note:      .symbol("music.note")
        case .album:     .symbol("square.stack")
        case .megaphone: .symbol("megaphone")
        case .star:      .symbol("star")
        case .heart:     .symbol("heart")
        }
    }
}
