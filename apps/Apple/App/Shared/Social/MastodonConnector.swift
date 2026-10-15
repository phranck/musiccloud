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
@MainActor
final class MastodonConnector {
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
    @discardableResult
    func connect(instanceInput: String) async throws -> MastodonAccount {
        guard let instance = MastodonAPI.instanceURL(from: instanceInput) else {
            throw SocialServiceError.invalidInput(String(localized: "Enter the address of a Mastodon server, such as mastodon.social."))
        }
        let app = try await appCredentials(for: instance)
        let verifier = OAuthSupport.makeCodeVerifier()
        let state = UUID().uuidString
        let authorizeURL = MastodonAPI.authorizeURL(instance: instance, clientID: app.clientID, state: state,
                                                    codeChallenge: OAuthSupport.codeChallenge(for: verifier))
        let callback = try await webSignIn.signIn(at: authorizeURL, callbackScheme: MastodonAPI.callbackScheme)
        guard callback.queryValue("state") == state, let code = callback.queryValue("code") else {
            throw SocialServiceError.missingCode
        }

        let token = try await session.decoded(MastodonTokenResponse.self,
                                              for: MastodonAPI.tokenRequest(instance: instance, app: app, code: code, codeVerifier: verifier),
                                              decoder: MastodonAPI.decoder).accessToken
        let profile = try await session.decoded(MastodonCredentialAccount.self,
                                                for: MastodonAPI.verifyCredentialsRequest(instance: instance, token: token),
                                                decoder: MastodonAPI.decoder)
        let account = MastodonAccount(
            instance: instance,
            accountID: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            avatarURL: profile.avatar,
            characterLimit: await characterLimit(of: instance)
        )
        store.add(account, token: token)
        return account
    }

    /// Revokes the account's token on its instance and removes the account.
    ///
    /// The account is removed even when the instance cannot be reached,
    /// because the user asked for it to be gone from this device.
    func disconnect(_ account: MastodonAccount) async {
        if let token = store.token(for: account), let app = store.appCredentials(for: account.host) {
            do {
                _ = try await session.checkedData(for: MastodonAPI.revokeRequest(instance: account.instance, app: app, token: token))
            } catch {
                AppLogger.api.error("Revoking the token of \(account.handle) failed: \(error.localizedDescription)")
            }
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
        if let stored = store.appCredentials(for: host) {
            return stored
        }
        let credentials = try await session.decoded(MastodonAppCredentials.self, for: MastodonAPI.registerAppRequest(instance: instance))
        store.setAppCredentials(credentials, for: host)
        return credentials
    }

    /// The instance's character limit, or Mastodon's default when it does not say.
    func characterLimit(of instance: URL) async -> Int {
        let description = try? await session.decoded(MastodonInstanceDescription.self,
                                                     for: MastodonAPI.instanceRequest(instance: instance),
                                                     decoder: MastodonAPI.decoder)
        return description?.configuration?.statuses?.maxCharacters ?? MastodonAPI.defaultCharacterLimit
    }
}
