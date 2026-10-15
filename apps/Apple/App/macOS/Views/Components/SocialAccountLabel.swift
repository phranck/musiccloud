#if os(macOS)
//
//  SocialAccountLabel.swift
//  musiccloud
//

import SwiftUI

// MARK: - SocialAccountLabel

/// A connected account as Settings and the composer show it: the avatar,
/// the display name, and the handle below it.
struct SocialAccountLabel: View {
    let account: SocialAccount

    var body: some View {
        HStack(spacing: 10) {
            AsyncImage(url: account.avatarURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: "person.crop.circle.fill")
                    .resizable()
                    .foregroundStyle(.secondary)
            }
            .frame(width: 32, height: 32)
            .clipShape(.circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                Text(account.handle)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - SocialAccount + Connectors

extension SocialAccount {
    /// Signs the account out on its server and removes it.
    @MainActor
    func disconnect() async {
        guard let delegate = AppDelegate.shared else { return }
        switch self {
        case .mastodon(let account): await delegate.mastodonConnector.disconnect(account)
        case .bluesky(let account):  await delegate.blueskyConnector.disconnect(account)
        }
    }

    /// Posts `markdown` from the account, converted the way its service needs.
    @MainActor
    func post(_ markdown: String) async throws {
        guard let delegate = AppDelegate.shared else { return }
        switch self {
        case .mastodon(let account): try await delegate.mastodonConnector.post(markdown, from: account)
        case .bluesky(let account):  try await delegate.blueskyConnector.post(markdown, from: account)
        }
    }

    /// The account with what its server currently says about limits and formats.
    @MainActor
    func refreshed() async -> SocialAccount {
        guard let delegate = AppDelegate.shared, case .mastodon(let account) = self else { return self }
        return .mastodon(await delegate.mastodonConnector.refreshServerInfo(of: account))
    }
}

#endif
