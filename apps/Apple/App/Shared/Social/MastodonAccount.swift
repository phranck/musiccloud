//
//  MastodonAccount.swift
//  musiccloud
//

import Foundation

// MARK: - MastodonAccount

/// A Mastodon account the user connected, as listed in Settings.
///
/// The access token is not part of this value. It lives in the Keychain
/// under ``id``, so the JSON file with the accounts holds nothing secret.
struct MastodonAccount: Codable, Identifiable, Hashable, Sendable {
    /// `https://<host>` of the instance the account lives on.
    let instance: URL
    /// The account's id on its instance.
    let accountID: String
    let username: String
    let displayName: String
    let avatarURL: URL?
    /// How many characters a post on this instance may have.
    var characterLimit: Int
    /// Whether the instance renders Markdown in posts, which upstream Mastodon does not.
    var supportsMarkdown: Bool

    init(instance: URL, accountID: String, username: String, displayName: String, avatarURL: URL?,
         characterLimit: Int, supportsMarkdown: Bool = false) {
        self.instance = instance
        self.accountID = accountID
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.characterLimit = characterLimit
        self.supportsMarkdown = supportsMarkdown
    }

    /// Reads accounts stored before ``supportsMarkdown`` existed as not supporting it,
    /// until the composer asks the instance again.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        instance = try container.decode(URL.self, forKey: .instance)
        accountID = try container.decode(String.self, forKey: .accountID)
        username = try container.decode(String.self, forKey: .username)
        displayName = try container.decode(String.self, forKey: .displayName)
        avatarURL = try container.decodeIfPresent(URL.self, forKey: .avatarURL)
        characterLimit = try container.decode(Int.self, forKey: .characterLimit)
        supportsMarkdown = try container.decodeIfPresent(Bool.self, forKey: .supportsMarkdown) ?? false
    }

    /// Unique across instances, because account ids are only unique on one.
    var id: String { "\(accountID)@\(host)" }

    /// The instance's host, such as `mastodon.social`.
    var host: String { instance.host() ?? instance.absoluteString }

    /// The handle other servers know the account by, such as `@musiccloud@oldbytes.space`.
    var handle: String { "@\(username)@\(host)" }

    /// The name to show, falling back to the username when the profile has none.
    var name: String { displayName.isEmpty ? username : displayName }
}
