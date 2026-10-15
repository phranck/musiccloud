//
//  MastodonConnector.swift
//  musiccloud
//

import AuthenticationServices
import Foundation

// MARK: - MastodonConnectorError

/// Why connecting or disconnecting a Mastodon account failed, worded for the user.
enum MastodonConnectorError: LocalizedError, Equatable {
    case invalidInstance
    case instanceRefused(status: Int)
    case cancelled
    case missingCode
    case unexpectedAnswer

    var errorDescription: String? {
        switch self {
        case .invalidInstance:
            String(localized: "Enter the address of a Mastodon server, such as mastodon.social.")
        case .instanceRefused(let status):
            String(localized: "The server refused the request (HTTP \(status)).")
        case .cancelled:
            String(localized: "Signing in was cancelled.")
        case .missingCode:
            String(localized: "The server did not return a sign-in code.")
        case .unexpectedAnswer:
            String(localized: "The server's answer could not be read. Is it a Mastodon server?")
        }
    }
}

// MARK: - MastodonConnector

/// Connects a Mastodon account: registers musiccloud on the instance once,
/// lets the user sign in there in a browser sheet, and keeps the account
/// and its token in ``SocialAccountStore``.
///
/// The sign-in page belongs to the instance, so musiccloud never sees the
/// password. PKCE and a random `state` tie the returned code to this
/// request, so a code from another sign-in is rejected.
@MainActor
final class MastodonConnector: NSObject {
    private let store: SocialAccountStore
    private let session: URLSession
    /// Kept alive while the browser sheet is open; the system releases it otherwise.
    private var authSession: ASWebAuthenticationSession?

    init(store: SocialAccountStore, session: URLSession = .shared) {
        self.store = store
        self.session = session
    }

    /// Signs in on the instance the user typed and stores the account.
    ///
    /// - Parameter instanceInput: A host, URL or handle; see ``MastodonAPI/instanceURL(from:)``.
    /// - Returns: The connected account.
    /// - Throws: ``MastodonConnectorError`` or a network error.
    @discardableResult
    func connect(instanceInput: String) async throws -> MastodonAccount {
        guard let instance = MastodonAPI.instanceURL(from: instanceInput) else {
            throw MastodonConnectorError.invalidInstance
        }
        let app = try await appCredentials(for: instance)
        let verifier = MastodonAPI.makeCodeVerifier()
        let state = UUID().uuidString
        let authorizeURL = MastodonAPI.authorizeURL(instance: instance, clientID: app.clientID, state: state,
                                                    codeChallenge: MastodonAPI.codeChallenge(for: verifier))
        let callback = try await signIn(at: authorizeURL)

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value else {
            throw MastodonConnectorError.missingCode
        }

        let token = try await fetch(MastodonTokenResponse.self,
                                    MastodonAPI.tokenRequest(instance: instance, app: app, code: code, codeVerifier: verifier))
            .accessToken
        let profile = try await fetch(MastodonCredentialAccount.self,
                                      MastodonAPI.verifyCredentialsRequest(instance: instance, token: token))
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
    /// because the user asked for it to be gone from this Mac.
    func disconnect(_ account: MastodonAccount) async {
        if let token = store.token(for: account), let app = store.appCredentials(for: account.host) {
            do {
                _ = try await data(for: MastodonAPI.revokeRequest(instance: account.instance, app: app, token: token))
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
    func appCredentials(for instance: URL) async throws -> MastodonAppCredentials {
        let host = instance.host() ?? instance.absoluteString
        if let stored = store.appCredentials(for: host) {
            return stored
        }
        let (body, _) = try await data(for: MastodonAPI.registerAppRequest(instance: instance))
        guard let credentials = try? JSONDecoder().decode(MastodonAppCredentials.self, from: body) else {
            throw MastodonConnectorError.unexpectedAnswer
        }
        store.setAppCredentials(credentials, for: host)
        return credentials
    }

    /// Opens the instance's sign-in page and waits for the redirect back to musiccloud.
    func signIn(at url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let completion: ASWebAuthenticationSession.CompletionHandler = { [weak self] callback, error in
                Task { @MainActor in self?.authSession = nil }
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: MastodonConnectorError.cancelled)
                } else {
                    continuation.resume(throwing: error ?? MastodonConnectorError.missingCode)
                }
            }
            let authSession: ASWebAuthenticationSession
            if #available(iOS 17.4, macOS 14.4, *) {
                authSession = ASWebAuthenticationSession(url: url, callback: .customScheme(MastodonAPI.callbackScheme),
                                                         completionHandler: completion)
            } else {
                authSession = ASWebAuthenticationSession(url: url, callbackURLScheme: MastodonAPI.callbackScheme,
                                                         completionHandler: completion)
            }
            authSession.presentationContextProvider = self
            self.authSession = authSession
            authSession.start()
        }
    }

    /// The instance's character limit, or Mastodon's default when it does not say.
    func characterLimit(of instance: URL) async -> Int {
        let description = try? await fetch(MastodonInstanceDescription.self, MastodonAPI.instanceRequest(instance: instance))
        return description?.configuration?.statuses?.maxCharacters ?? MastodonAPI.defaultCharacterLimit
    }

    func fetch<Answer: Decodable>(_ type: Answer.Type, _ request: URLRequest) async throws -> Answer {
        let (body, _) = try await data(for: request)
        guard let answer = try? MastodonAPI.decoder.decode(type, from: body) else {
            throw MastodonConnectorError.unexpectedAnswer
        }
        return answer
    }

    /// Sends `request` and fails on any status outside 2xx.
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (body, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw MastodonConnectorError.unexpectedAnswer }
        guard (200..<300).contains(http.statusCode) else {
            throw MastodonConnectorError.instanceRefused(status: http.statusCode)
        }
        return (body, http)
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension MastodonConnector: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            #if os(macOS)
            NSApp.keyWindow ?? ASPresentationAnchor()
            #else
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
            #endif
        }
    }
}
