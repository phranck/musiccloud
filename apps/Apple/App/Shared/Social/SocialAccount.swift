//
//  SocialAccount.swift
//  musiccloud
//

import Foundation

// MARK: - SocialAccount

/// A connected account of either service, as Settings and the composer list it.
enum SocialAccount: Identifiable, Hashable, Sendable {
    case mastodon(MastodonAccount)
    case bluesky(BlueskyAccount)

    /// Every connected account in `store`, Mastodon first, each in the order it was connected.
    @MainActor
    static func all(in store: SocialAccountStore) -> [SocialAccount] {
        store.mastodonAccounts.map(SocialAccount.mastodon) + store.blueskyAccounts.map(SocialAccount.bluesky)
    }

    var id: String {
        switch self {
        case .mastodon(let account): "mastodon:\(account.id)"
        case .bluesky(let account):  "bluesky:\(account.id)"
        }
    }

    var name: String {
        switch self {
        case .mastodon(let account): account.name
        case .bluesky(let account):  account.name
        }
    }

    var handle: String {
        switch self {
        case .mastodon(let account): account.handle
        case .bluesky(let account):  account.displayHandle
        }
    }

    var avatarURL: URL? {
        switch self {
        case .mastodon(let account): account.avatarURL
        case .bluesky(let account):  account.avatarURL
        }
    }

    /// The service's logo.
    var icon: PostTemplateIcon {
        switch self {
        case .mastodon: .mastodon
        case .bluesky:  .bluesky
        }
    }

    /// How long a post from this account may be, in the unit ``length(ofMarkdown:)`` counts.
    var limit: Int {
        switch self {
        case .mastodon(let account): account.characterLimit
        case .bluesky:               BlueskyAPI.postGraphemeLimit
        }
    }

    /// Whether the post arrives formatted, which only a Mastodon server that renders Markdown does.
    var keepsMarkdown: Bool {
        switch self {
        case .mastodon(let account): account.supportsMarkdown
        case .bluesky:               false
        }
    }

    /// The length the service counts for a post written from `markdown`, as it will be sent.
    func length(ofMarkdown markdown: String) -> Int {
        switch self {
        case .mastodon(let account):
            PostFormatter.mastodonLength(of: account.supportsMarkdown ? markdown : PostFormatter.mastodonPlainText(fromMarkdown: markdown))
        case .bluesky:
            PostFormatter.bluesky(fromMarkdown: markdown).graphemeCount
        }
    }
}
