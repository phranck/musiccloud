//
//  SocialAccountStore.swift
//  musiccloud
//

import Foundation
import Observation

// MARK: - SocialAccountStore

/// The social media accounts the user connected, and their secrets.
///
/// The accounts are kept as JSON in Application Support. Access tokens and
/// the OAuth client each instance issued live in the Keychain, never in the
/// file. Like ``PostTemplateStore``, every change starts from the file, so a
/// second copy of the app does not lose the accounts the other one added.
@MainActor
@Observable
final class SocialAccountStore {
    /// The connected Mastodon accounts, in the order they were connected.
    private(set) var mastodonAccounts: [MastodonAccount] = []

    @ObservationIgnored private let file: JSONFile<[MastodonAccount]>?
    /// `nil` keeps secrets in memory, which is what previews and tests use.
    @ObservationIgnored private let keychain: KeychainItems?
    @ObservationIgnored private var secretsInMemory: [String: Data] = [:]

    /// The Keychain items of the app's social media accounts.
    nonisolated static let defaultKeychain = KeychainItems(service: "io.musiccloud.social-accounts", accessGroup: nil)

    /// Creates a store reading and writing `fileURL`, or keeping accounts in memory when it is `nil`.
    ///
    /// - Parameters:
    ///   - fileURL: Where the account list is kept.
    ///   - keychain: Where tokens and client credentials are kept, or `nil` to keep them in memory.
    init(fileURL: URL? = .applicationSupportFile(named: "social-accounts.json"),
         keychain: KeychainItems? = SocialAccountStore.defaultKeychain) {
        self.file = fileURL.map { JSONFile(url: $0, label: "Social accounts") }
        self.keychain = keychain
        load()
    }

    /// Adds `account` with its access token, or replaces it when it is connected already.
    func add(_ account: MastodonAccount, token: String) {
        setSecret(Data(token.utf8), for: tokenKey(account.id))
        change { accounts in
            if let index = accounts.firstIndex(where: { $0.id == account.id }) {
                accounts[index] = account
            } else {
                accounts.append(account)
            }
        }
    }

    /// Removes `account` and forgets its token.
    func remove(_ account: MastodonAccount) {
        setSecret(nil, for: tokenKey(account.id))
        change { $0.removeAll { $0.id == account.id } }
    }

    /// The access token of `account`, if it is still stored.
    func token(for account: MastodonAccount) -> String? {
        secret(for: tokenKey(account.id)).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// The OAuth client `host` issued to musiccloud, if it registered the app before.
    func appCredentials(for host: String) -> MastodonAppCredentials? {
        secret(for: appKey(host)).flatMap { try? JSONDecoder().decode(MastodonAppCredentials.self, from: $0) }
    }

    /// Keeps the OAuth client `host` issued, so the next account there reuses it.
    func setAppCredentials(_ credentials: MastodonAppCredentials, for host: String) {
        setSecret(try? JSONEncoder().encode(credentials), for: appKey(host))
    }
}

private extension SocialAccountStore {
    func tokenKey(_ accountID: String) -> String { "mastodon-token:\(accountID)" }
    func appKey(_ host: String) -> String { "mastodon-app:\(host)" }

    func secret(for key: String) -> Data? {
        keychain.map { $0.data(for: key) } ?? secretsInMemory[key]
    }

    func setSecret(_ data: Data?, for key: String) {
        if let keychain {
            keychain.setData(data, for: key)
        } else {
            secretsInMemory[key] = data
        }
    }

    func change(_ edit: (inout [MastodonAccount]) -> Void) {
        load()
        edit(&mastodonAccounts)
        save()
    }

    func load() {
        if let stored = file?.load() {
            mastodonAccounts = stored
        }
    }

    func save() {
        file?.save(mastodonAccounts)
    }
}
