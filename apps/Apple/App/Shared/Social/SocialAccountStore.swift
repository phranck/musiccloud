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

    /// Serializes the renewal of Bluesky sessions across processes, or `nil`
    /// for a store that keeps its accounts in memory.
    ///
    /// Bluesky rotates the refresh token on every renewal, so each one works
    /// once. On iOS the app and the Share Extension are two processes reading
    /// the same session from the app group Keychain, and when both renew at
    /// once the second is refused. The lock file sits beside the account
    /// files, which on iOS is the app group container both processes reach.
    @ObservationIgnored let blueskySessionLock: SessionFileLock?

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
    ///   - directory: The folder of `social-accounts.json` (Mastodon), `bluesky-accounts.json`,
    ///     and `bluesky-session.lock`, see ``blueskySessionLock``.
    ///   - keychain: Where tokens and sessions are kept, or `nil` to keep them in memory.
    init(directory: URL? = SocialAccountStore.defaultDirectory(),
         keychain: KeychainItems? = SocialAccountStore.defaultKeychain) {
        mastodonFile = directory.map { JSONFile(url: $0.appending(path: "social-accounts.json"), label: "Mastodon accounts") }
        blueskyFile = directory.map { JSONFile(url: $0.appending(path: "bluesky-accounts.json"), label: "Bluesky accounts") }
        blueskySessionLock = directory.map { SessionFileLock(url: $0.appending(path: "bluesky-session.lock")) }
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
    ///
    /// It is read from the Keychain on every call, so a session the other
    /// process renewed is seen at once.
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

// MARK: - SessionFileLock

/// An exclusive POSIX advisory lock (`flock`) on a file, held around a short piece of async work.
///
/// An advisory lock binds every process that opens the same file, so the app
/// and the Share Extension wait for each other when the file lies in the app
/// group container. Each use opens the file anew, so two uses within one
/// process exclude each other as well. Waiting for the lock blocks a thread,
/// so it waits on a global dispatch queue and never on the caller's actor.
/// The system drops the lock when a process ends while holding it, so a
/// crash never leaves the other process waiting.
struct SessionFileLock: Sendable {
    /// The lock file, created on first use. Its content is never read.
    let url: URL

    /// Runs `body` while holding the lock, waiting first until no other holder has it.
    ///
    /// The lock is released when `body` returns or throws.
    ///
    /// - Parameters:
    ///   - isolation: The caller's actor, which `body` runs on.
    ///   - body: The work to serialize. It stays short and never waits for the
    ///     user, because every other process waits for it.
    /// - Returns: What `body` returns.
    /// - Throws: A `POSIXError` when the lock file cannot be opened or locked, or what `body` throws.
    func withLock<Value>(isolation: isolated (any Actor)? = #isolation,
                         _ body: () async throws -> Value) async throws -> Value {
        let descriptor = try await Self.acquire(at: url.path(percentEncoded: false))
        defer {
            flock(descriptor, LOCK_UN)
            close(descriptor)
        }
        return try await body()
    }

    /// Opens the lock file at `path` and waits on a dispatch thread until it holds the exclusive lock.
    ///
    /// - Returns: The open file descriptor, which holds the lock until it is closed.
    private static func acquire(at path: String) async throws -> Int32 {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let descriptor = open(path, O_RDWR | O_CREAT | O_CLOEXEC, 0o600)
                guard descriptor >= 0 else {
                    continuation.resume(throwing: lastError())
                    return
                }
                var status = flock(descriptor, LOCK_EX)
                // A signal interrupts the wait without the lock being taken.
                while status != 0 && errno == EINTR {
                    status = flock(descriptor, LOCK_EX)
                }
                guard status == 0 else {
                    let error = lastError()
                    close(descriptor)
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: descriptor)
            }
        }
    }

    /// The error `errno` names after a failed system call.
    private static func lastError() -> POSIXError {
        POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
    }
}
