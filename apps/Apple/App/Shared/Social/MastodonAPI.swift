//
//  MastodonAPI.swift
//  musiccloud
//

import Foundation

// MARK: - MastodonAPI

/// The requests musiccloud sends to a Mastodon instance to connect an account.
///
/// Every request is built here as a pure function, so the shape each
/// instance receives can be tested without a network. The endpoints and
/// parameters follow the Mastodon API documentation for `POST /api/v1/apps`,
/// `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke`,
/// `GET /api/v1/accounts/verify_credentials` and `GET /api/v2/instance`.
enum MastodonAPI {
    /// The scheme ASWebAuthenticationSession waits for. The app registers it in Info.plist.
    static let callbackScheme = "musiccloud"
    /// Where the instance sends the browser back after the user approves.
    static let redirectURI = "musiccloud://oauth/mastodon"
    /// Posting a status with media, and reading the account it is posted from.
    static let scopes = "write:statuses write:media read:accounts"
    /// The name the instance shows on its authorization page and beside each post.
    static let clientName = "musiccloud"
    static let website = "https://musiccloud.io"
    /// The limit Mastodon itself ships with, used when an instance does not report its own.
    static let defaultCharacterLimit = 500

    /// The instance a user means, from what they typed into the field.
    ///
    /// Accepts a bare host (`mastodon.social`), a URL (`https://mastodon.social/about`)
    /// and a full handle (`@user@mastodon.social`). Only HTTPS is used.
    ///
    /// - Returns: `https://<host>` with the host in lowercase, or `nil` when no host can be read.
    static func instanceURL(from input: String) -> URL? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.contains("://"), let atSign = text.lastIndex(of: "@") {
            text = String(text[text.index(after: atSign)...])
        }
        if !text.contains("://") {
            text = "https://" + text
        }
        guard let host = URLComponents(string: text)?.host?.lowercased(),
              host.contains("."), !host.hasPrefix("."), !host.hasSuffix(".") else { return nil }
        return URL(string: "https://\(host)")
    }

    /// Registers musiccloud as an OAuth client on `instance`.
    static func registerAppRequest(instance: URL) -> URLRequest {
        var request = URLRequest(url: instance.appending(path: "api/v1/apps"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode([
            "client_name": clientName,
            "redirect_uris": redirectURI,
            "scopes": scopes,
            "website": website,
        ])
        return request
    }

    /// The page on `instance` where the user signs in and approves musiccloud.
    ///
    /// `force_login` lets a second account on the same instance be connected
    /// while the browser is still signed in with the first.
    static func authorizeURL(instance: URL, clientID: String, state: String, codeChallenge: String) -> URL {
        var components = URLComponents(url: instance.appending(path: "oauth/authorize"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: scopes),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "force_login", value: "true"),
        ]
        return components?.url ?? instance
    }

    /// Exchanges the authorization `code` for an access token.
    static func tokenRequest(instance: URL, app: MastodonAppCredentials, code: String, codeVerifier: String) -> URLRequest {
        OAuthSupport.formRequest(instance.appending(path: "oauth/token"), [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", app.clientID),
            ("client_secret", app.clientSecret),
            ("redirect_uri", redirectURI),
            ("code_verifier", codeVerifier),
        ])
    }

    /// Makes `token` invalid on `instance`, which is what disconnecting an account does there.
    static func revokeRequest(instance: URL, app: MastodonAppCredentials, token: String) -> URLRequest {
        OAuthSupport.formRequest(instance.appending(path: "oauth/revoke"), [
            ("client_id", app.clientID),
            ("client_secret", app.clientSecret),
            ("token", token),
        ])
    }

    /// The account `token` belongs to.
    static func verifyCredentialsRequest(instance: URL, token: String) -> URLRequest {
        var request = URLRequest(url: instance.appending(path: "api/v1/accounts/verify_credentials"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    /// The instance's public description, which holds its character limit.
    static func instanceRequest(instance: URL) -> URLRequest {
        URLRequest(url: instance.appending(path: "api/v2/instance"))
    }

    /// The decoder for every Mastodon answer, whose keys are in snake case.
    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}

// MARK: - Answers

/// The OAuth client an instance issued to musiccloud, kept per instance so
/// connecting a second account does not register the app again.
///
/// The coding keys name the snake case fields, so this is decoded with a
/// plain `JSONDecoder` rather than ``MastodonAPI/decoder``, whose key
/// conversion would turn `client_id` into `clientId` and miss them.
struct MastodonAppCredentials: Codable, Equatable, Sendable {
    let clientID: String
    let clientSecret: String

    enum CodingKeys: String, CodingKey {
        case clientID = "client_id"
        case clientSecret = "client_secret"
    }
}

/// The part of `POST /oauth/token`'s answer musiccloud keeps.
struct MastodonTokenResponse: Decodable {
    let accessToken: String
}

/// The part of the Account entity shown in Settings.
struct MastodonCredentialAccount: Decodable {
    let id: String
    let username: String
    let displayName: String
    let avatar: URL?
}

/// The part of `GET /api/v2/instance`'s answer that limits a post's length.
struct MastodonInstanceDescription: Decodable {
    struct Configuration: Decodable {
        struct Statuses: Decodable {
            let maxCharacters: Int?
        }
        let statuses: Statuses?
    }
    let configuration: Configuration?
}
