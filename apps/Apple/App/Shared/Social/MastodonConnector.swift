//
//  MastodonConnector.swift
//  musiccloud
//

import Foundation

// MARK: - MastodonConnector

/// Connects a Mastodon account: registers musiccloud on the instance once,
/// lets the user sign in there through ``WebSignIn``, and keeps the account
/// and its token in ``SocialAccountStore``.
///
/// PKCE and a random `state` tie the returned code to this request, so a
/// code from another sign-in is rejected.
@MainActor final class MastodonConnector {
    private let store: SocialAccountStore
    private let session: URLSession
    private let webSignIn = WebSignIn()

    init(store: SocialAccountStore, session: URLSession = .shared) {
        self.store = store
        self.session = session
    }

    /// Signs in on the instance the user typed and stores the account.
    ///
    /// - Parameter instanceInput: A host, URL or handle; see ``MastodonAPI/instanceURL(from:)``.
    /// - Returns: The connected account.
    /// - Throws: ``SocialServiceError``, `CancellationError` when the user closes the sheet, or a network error.
    @discardableResult func connect(instanceInput: String) async throws -> MastodonAccount {
        guard let instance = MastodonAPI.instanceURL(from: instanceInput) else {
            throw SocialServiceError.invalidInput(String(localized: "Enter the address of a Mastodon server, such as mastodon.social."))
        }
        let app = try await appCredentials(for: instance)
        let verifier = OAuthSupport.makeCodeVerifier()
        let state = UUID().uuidString
        let authorizeURL = MastodonAPI.authorizeURL(
            instance: instance,
            clientID: app.clientID,
            state: state,
            codeChallenge: OAuthSupport.codeChallenge(for: verifier)
        )
        let callback = try await webSignIn.signIn(at: authorizeURL, callbackScheme: MastodonAPI.callbackScheme)
        guard callback.queryValue("state") == state, let code = callback.queryValue("code") else { throw SocialServiceError.missingCode }

        let token = try await session.decoded(
            MastodonTokenResponse.self,
            for: MastodonAPI.tokenRequest(instance: instance, app: app, code: code, codeVerifier: verifier),
            decoder: MastodonAPI.decoder
        ).accessToken
        let profile = try await session.decoded(
            MastodonCredentialAccount.self,
            for: MastodonAPI.verifyCredentialsRequest(instance: instance, token: token),
            decoder: MastodonAPI.decoder
        )
        let server = await serverInfo(of: instance)
        let account = MastodonAccount(
            instance: instance,
            accountID: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            avatarURL: profile.avatar,
            characterLimit: server.characterLimit,
            supportsMarkdown: server.supportsMarkdown
        )
        store.add(account, token: token)
        return account
    }

    /// The account with its instance's current character limit and Markdown support.
    ///
    /// An instance can change both, so the composer asks before it counts.
    /// When the instance does not answer, the stored values stay.
    func refreshServerInfo(of account: MastodonAccount) async -> MastodonAccount {
        guard let description = try? await instanceDescription(of: account.instance) else { return account }
        var refreshed = account
        refreshed.characterLimit = description.characterLimit
        refreshed.supportsMarkdown = description.supportsMarkdown
        if refreshed != account { store.update(refreshed) }
        return refreshed
    }

    /// Posts `markdown` from `account`: as Markdown where the instance renders it, as plain text everywhere else.
    func post(_ markdown: String, from account: MastodonAccount) async throws {
        guard let token = store.token(for: account) else { throw SocialServiceError.signedOut }
        let text = account.supportsMarkdown ? markdown : PostFormatter.mastodonPlainText(fromMarkdown: markdown)
        _ = try await session.checkedData(
            for: MastodonAPI.postStatusRequest(
                instance: account.instance,
                token: token,
                text: text,
                markdown: account.supportsMarkdown,
                idempotencyKey: UUID().uuidString
            )
        )
    }

    /// Revokes the account's token on its instance and removes the account.
    ///
    /// The account is removed even when the instance cannot be reached,
    /// because the user asked for it to be gone from this device.
    func disconnect(_ account: MastodonAccount) async {
        if let token = store.token(for: account), let app = store.appCredentials(for: account.host) {
            do {
                _ = try await session.checkedData(for: MastodonAPI.revokeRequest(instance: account.instance, app: app, token: token))
            } catch { AppLogger.api.error("Revoking the token of \(account.handle) failed: \(error.localizedDescription)") }
        }
        store.remove(account)
    }
}

// MARK: - Steps

private extension MastodonConnector {
    /// The client musiccloud has on `instance`, registering it there the first time.
    ///
    /// Decoded with a plain decoder; see ``MastodonAppCredentials``.
    func appCredentials(for instance: URL) async throws -> MastodonAppCredentials {
        let host = instance.host() ?? instance.absoluteString
        if let stored = store.appCredentials(for: host) { return stored }
        let credentials = try await session.decoded(MastodonAppCredentials.self, for: MastodonAPI.registerAppRequest(instance: instance))
        store.setAppCredentials(credentials, for: host)
        return credentials
    }

    /// The instance's limit and Markdown support, or upstream Mastodon's defaults when it does not answer.
    func serverInfo(of instance: URL) async -> (characterLimit: Int, supportsMarkdown: Bool) {
        let description = try? await instanceDescription(of: instance)
        return (description?.characterLimit ?? MastodonAPI.defaultCharacterLimit, description?.supportsMarkdown ?? false)
    }

    func instanceDescription(of instance: URL) async throws -> MastodonInstanceDescription {
        try await session.decoded(
            MastodonInstanceDescription.self,
            for: MastodonAPI.instanceRequest(instance: instance),
            decoder: MastodonAPI.decoder
        )
    }
}
