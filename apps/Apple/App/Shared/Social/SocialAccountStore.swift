//
//  SocialAccountStore.swift
//  musiccloud
//

import Foundation
import Observation

// MARK: - SocialAccountStore

/// The social media accounts the user connected, and their secrets.
///
/// Each service's accounts are kept as a JSON file in Application Support.
/// Access tokens, Bluesky sessions with their DPoP keys, and the OAuth
/// client each Mastodon instance issued live in the Keychain, never in a
/// file. Like ``PostTemplateStore``, every change starts from the file, so a
/// second copy of the app does not lose the accounts the other one added.
@MainActor
@Observable
final class SocialAccountStore {
    /// The connected Mastodon accounts, in the order they were connected.
    private(set) var mastodonAccounts: [MastodonAccount] = []
    /// The connected Bluesky accounts, in the order they were connected.
    private(set) var blueskyAccounts: [BlueskyAccount] = []

    @ObservationIgnored private let mastodonFile: JSONFile<[MastodonAccount]>?
    @ObservationIgnored private let blueskyFile: JSONFile<[BlueskyAccount]>?
    /// `nil` keeps secrets in memory, which is what previews and tests use.
    @ObservationIgnored private let keychain: KeychainItems?
    @ObservationIgnored private var secretsInMemory: [String: Data] = [:]

    #if os(iOS)
    /// The Keychain items of the app's social media accounts.
    ///
    /// On iOS they belong to the app group, so the Share Extension reads the
    /// same tokens and sessions. An app group is a valid access group there
    /// without a Keychain Sharing entitlement.
    nonisolated static let defaultKeychain = KeychainItems(service: "io.musiccloud.social-accounts",
                                                           accessGroup: SharedStoreConfiguration.appGroupIdentifier)
    #else
    /// The Keychain items of the app's social media accounts.
    ///
    /// On the Mac they stay in the app's own access group, where the
    /// accounts connected so far are kept.
    nonisolated static let defaultKeychain = KeychainItems(service: "io.musiccloud.social-accounts", accessGroup: nil)
    #endif

    /// The folder of the account files.
    ///
    /// On iOS it is `Library/Application Support/musiccloud` in the app group
    /// container, created on demand, so the Share Extension reads the same
    /// accounts. On the Mac it is `Application Support/musiccloud`, where the
    /// accounts connected so far are kept. `nil` when the folder cannot be found.
    nonisolated static func defaultDirectory() -> URL? {
        #if os(iOS)
        let fileManager = FileManager.default
        guard let container = fileManager.containerURL(
            forSecurityApplicationGroupIdentifier: SharedStoreConfiguration.appGroupIdentifier) else { return nil }
        let directory = container.appending(path: "Library/Application Support/musiccloud", directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
        #else
        return .applicationSupportFolder()
        #endif
    }

    /// Creates a store reading and writing its files in `directory`, or keeping accounts in memory when it is `nil`.
    ///
    /// - Parameters:
    ///   - directory: The folder of `social-accounts.json` (Mastodon) and `bluesky-accounts.json`.
    ///   - keychain: Where tokens and sessions are kept, or `nil` to keep them in memory.
    init(directory: URL? = SocialAccountStore.defaultDirectory(),
         keychain: KeychainItems? = SocialAccountStore.defaultKeychain) {
        mastodonFile = directory.map { JSONFile(url: $0.appending(path: "social-accounts.json"), label: "Mastodon accounts") }
        blueskyFile = directory.map { JSONFile(url: $0.appending(path: "bluesky-accounts.json"), label: "Bluesky accounts") }
        self.keychain = keychain
        load()
    }

    // MARK: Mastodon

    /// Adds `account` with its access token, or replaces it when it is connected already.
    func add(_ account: MastodonAccount, token: String) {
        setSecret(Data(token.utf8), for: mastodonTokenKey(account.id))
        change { $0.mastodonAccounts.upsert(account) }
    }

    /// Replaces the stored copy of `account`, keeping its token, as when its instance changed its limit.
    func update(_ account: MastodonAccount) {
        change { $0.mastodonAccounts.upsert(account) }
    }

    /// Removes `account` and forgets its token.
    func remove(_ account: MastodonAccount) {
        setSecret(nil, for: mastodonTokenKey(account.id))
        change { $0.mastodonAccounts.removeAll { $0.id == account.id } }
    }

    /// The access token of `account`, if it is still stored.
    func token(for account: MastodonAccount) -> String? {
        secret(for: mastodonTokenKey(account.id)).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// The OAuth client `host` issued to musiccloud, if it registered the app before.
    func appCredentials(for host: String) -> MastodonAppCredentials? {
        secret(for: mastodonAppKey(host)).flatMap { try? JSONDecoder().decode(MastodonAppCredentials.self, from: $0) }
    }

    /// Keeps the OAuth client `host` issued, so the next account there reuses it.
    func setAppCredentials(_ credentials: MastodonAppCredentials, for host: String) {
        setSecret(try? JSONEncoder().encode(credentials), for: mastodonAppKey(host))
    }

    // MARK: Bluesky

    /// Adds `account` with its session, or replaces both when it is connected already.
    func add(_ account: BlueskyAccount, session: BlueskySession) {
        setSession(session, for: account)
        change { $0.blueskyAccounts.upsert(account) }
    }

    /// Removes `account` and forgets its session and DPoP key.
    func remove(_ account: BlueskyAccount) {
        setSecret(nil, for: blueskySessionKey(account.id))
        change { $0.blueskyAccounts.removeAll { $0.id == account.id } }
    }

    /// The session of `account`, if it is still stored.
    func session(for account: BlueskyAccount) -> BlueskySession? {
        secret(for: blueskySessionKey(account.id)).flatMap { try? JSONDecoder().decode(BlueskySession.self, from: $0) }
    }

    /// Replaces the session of `account`, which a token refresh does.
    func setSession(_ session: BlueskySession, for account: BlueskyAccount) {
        setSecret(try? JSONEncoder().encode(session), for: blueskySessionKey(account.id))
    }
}

private extension SocialAccountStore {
    func mastodonTokenKey(_ accountID: String) -> String { "mastodon-token:\(accountID)" }
    func mastodonAppKey(_ host: String) -> String { "mastodon-app:\(host)" }
    func blueskySessionKey(_ did: String) -> String { "bluesky-session:\(did)" }

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

    func change(_ edit: (SocialAccountStore) -> Void) {
        load()
        edit(self)
        mastodonFile?.save(mastodonAccounts)
        blueskyFile?.save(blueskyAccounts)
    }

    func load() {
        if let stored = mastodonFile?.load() {
            mastodonAccounts = stored
        }
        if let stored = blueskyFile?.load() {
            blueskyAccounts = stored
        }
    }
}

private extension Array where Element: Identifiable {
    /// Replaces the element with the same id, or appends `element`.
    mutating func upsert(_ element: Element) {
        if let index = firstIndex(where: { $0.id == element.id }) {
            self[index] = element
        } else {
            append(element)
        }
    }
}
