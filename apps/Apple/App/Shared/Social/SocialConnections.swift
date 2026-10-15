//
//  SocialConnections.swift
//  musiccloud
//

import Foundation

// MARK: - SocialConnections

/// The connected social media accounts of this process, with the connectors
/// that sign them in, post from them and sign them out.
///
/// There is one per process, because a connector has to outlive the view
/// that uses it: a browser sheet still open when Settings closes has to
/// finish, and a Bluesky refresh token works only once, so two connectors
/// renewing the same session would sign the account out.
@MainActor
final class SocialConnections {
    /// The instance of this process, keeping its accounts where
    /// ``SocialAccountStore/defaultDirectory()`` and
    /// ``SocialAccountStore/defaultKeychain`` say.
    static let shared = SocialConnections(store: SocialAccountStore())

    /// The connected accounts and their secrets.
    let store: SocialAccountStore
    /// Signs Mastodon accounts in and out and posts from them.
    let mastodon: MastodonConnector
    /// Signs Bluesky accounts in and out, posts from them and keeps their sessions renewed.
    let bluesky: BlueskyConnector

    /// Creates the connectors for the accounts in `store`.
    init(store: SocialAccountStore) {
        self.store = store
        mastodon = MastodonConnector(store: store)
        bluesky = BlueskyConnector(store: store)
    }
}

// MARK: - SocialAccount + Connectors

extension SocialAccount {
    /// Signs the account out on its server and removes it.
    ///
    /// On the Mac it also removes the account's automatic posting rule and
    /// its chosen default template, which exist only there, so an account
    /// connected again later starts from its system template.
    @MainActor
    func disconnect() async {
        #if os(macOS)
        AppDelegate.shared?.autoPostSettings.removeRule(for: id)
        AppDelegate.shared?.defaultTemplates.setTemplateID(nil, for: id)
        #endif
        let connections = SocialConnections.shared
        switch self {
        case .mastodon(let account): await connections.mastodon.disconnect(account)
        case .bluesky(let account):  await connections.bluesky.disconnect(account)
        }
    }

    /// Posts `markdown` from the account, converted the way its service needs.
    @MainActor
    func post(_ markdown: String) async throws {
        let connections = SocialConnections.shared
        switch self {
        case .mastodon(let account): try await connections.mastodon.post(markdown, from: account)
        case .bluesky(let account):  try await connections.bluesky.post(markdown, from: account)
        }
    }

    /// The account with what its server currently says about limits and formats.
    @MainActor
    func refreshed() async -> SocialAccount {
        guard case .mastodon(let account) = self else { return self }
        return .mastodon(await SocialConnections.shared.mastodon.refreshServerInfo(of: account))
    }
}
