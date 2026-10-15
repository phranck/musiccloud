//
//  BlueskyAPI.swift
//  musiccloud
//

import Foundation

// MARK: - BlueskyAPI

/// The addresses and requests musiccloud uses to sign a Bluesky account in
/// through AT Protocol OAuth.
///
/// The flow follows the AT Protocol OAuth profile: the handle leads to a
/// DID, the DID document to the account's server (PDS), and the PDS to its
/// authorization server. musiccloud is a public native client without a
/// secret; it identifies itself by the URL of its client metadata, which
/// `apps/frontend/public/oauth/client-metadata.json` serves on musiccloud.io.
enum BlueskyAPI {
    /// The URL of the client metadata, which is also musiccloud's client id.
    /// It has to match the `client_id` inside that file exactly.
    static let clientID = "https://musiccloud.io/oauth/client-metadata.json"
    /// A native client's redirect: the client id's host in reverse order, one colon, one slash.
    static let redirectURI = "io.musiccloud:/oauth/bluesky"
    static let callbackScheme = "io.musiccloud"
    /// `atproto` is required in every session; `transition:generic` allows writing posts.
    static let scope = "atproto transition:generic"
    /// A post's text may have 300 graphemes, per the `app.bsky.feed.post` lexicon.
    static let postGraphemeLimit = 300
    /// Bluesky's public API, which answers handle and profile lookups without a session.
    static let publicAPI = URL(string: "https://public.api.bsky.app")!

    /// The handle a user means, without `@` and in lowercase, or `nil` when it cannot be one.
    static func handle(from input: String) -> String? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if text.hasPrefix("@") {
            text.removeFirst()
        }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789.-")
        guard text.contains("."), !text.hasPrefix("."), !text.hasSuffix("."),
              text.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
        return text
    }

    // MARK: Discovery

    /// The handle's own answer, which a handle verified over HTTPS gives.
    static func wellKnownDIDURL(handle: String) -> URL? {
        URL(string: "https://\(handle)/.well-known/atproto-did")
    }

    /// The public API's lookup, which also covers handles verified by DNS.
    static func resolveHandleURL(handle: String) -> URL {
        publicAPI.appending(path: "xrpc/com.atproto.identity.resolveHandle")
            .appending(queryItems: [URLQueryItem(name: "handle", value: handle)])
    }

    /// Where the DID document of `did` is published: the PLC directory for
    /// `did:plc`, the host's well-known path for `did:web`.
    static func didDocumentURL(did: String) -> URL? {
        if did.hasPrefix("did:plc:") {
            return URL(string: "https://plc.directory/\(did)")
        }
        if did.hasPrefix("did:web:") {
            let host = String(did.dropFirst("did:web:".count))
            guard !host.contains(":") else { return nil }
            return URL(string: "https://\(host)/.well-known/did.json")
        }
        return nil
    }

    static func protectedResourceURL(pds: URL) -> URL {
        pds.appending(path: ".well-known/oauth-protected-resource")
    }

    static func authorizationServerMetadataURL(issuer: URL) -> URL {
        issuer.appending(path: ".well-known/oauth-authorization-server")
    }

    /// The profile with display name and avatar.
    static func profileURL(did: String) -> URL {
        publicAPI.appending(path: "xrpc/app.bsky.actor.getProfile")
            .appending(queryItems: [URLQueryItem(name: "actor", value: did)])
    }

    // MARK: OAuth

    /// The pushed authorization request, which the authorization page then refers to.
    static func pushedAuthorizationRequest(endpoint: URL, state: String, codeChallenge: String, loginHint: String) -> URLRequest {
        OAuthSupport.formRequest(endpoint, [
            ("client_id", clientID),
            ("response_type", "code"),
            ("redirect_uri", redirectURI),
            ("scope", scope),
            ("state", state),
            ("code_challenge", codeChallenge),
            ("code_challenge_method", "S256"),
            ("login_hint", loginHint),
        ])
    }

    /// The page where the user signs in, which only names the pushed request.
    static func authorizeURL(endpoint: URL, requestURI: String) -> URL {
        endpoint.appending(queryItems: [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "request_uri", value: requestURI),
        ])
    }

    static func tokenRequest(endpoint: URL, code: String, codeVerifier: String) -> URLRequest {
        OAuthSupport.formRequest(endpoint, [
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", redirectURI),
            ("code_verifier", codeVerifier),
            ("client_id", clientID),
        ])
    }

    static func refreshRequest(endpoint: URL, refreshToken: String) -> URLRequest {
        OAuthSupport.formRequest(endpoint, [
            ("grant_type", "refresh_token"),
            ("refresh_token", refreshToken),
            ("client_id", clientID),
        ])
    }

    static func revokeRequest(endpoint: URL, token: String) -> URLRequest {
        OAuthSupport.formRequest(endpoint, [
            ("token", token),
            ("client_id", clientID),
        ])
    }

    // MARK: Posting

    /// Writes `post` as an `app.bsky.feed.post` record into the account's repository on its PDS.
    static func createPostRequest(pds: URL, did: String, post: BlueskyPostText, createdAt: Date) -> URLRequest {
        var request = URLRequest(url: pds.appending(path: "xrpc/com.atproto.repo.createRecord"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(BlueskyCreateRecord(
            repo: did,
            record: BlueskyPostRecord(text: post.text, facets: post.facets.isEmpty ? nil : post.facets,
                                      createdAt: createdAt.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true)))))
        return request
    }

    /// The decoder for OAuth answers, whose keys are in snake case. XRPC
    /// answers use camel case, which the conversion leaves as it is.
    static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}

// MARK: - Answers

/// `com.atproto.identity.resolveHandle`.
struct BlueskyResolvedHandle: Decodable {
    let did: String
}

/// The parts of a DID document that lead to the account's server and confirm its handle.
struct BlueskyDIDDocument: Decodable {
    struct Service: Decodable {
        let id: String
        let type: String
        let serviceEndpoint: String
    }

    let id: String
    let alsoKnownAs: [String]?
    let service: [Service]?

    /// The account's PDS: the service whose id ends in `#atproto_pds`, reached over HTTPS.
    var pdsEndpoint: URL? {
        guard let entry = service?.first(where: { $0.id.hasSuffix("#atproto_pds") && $0.type == "AtprotoPersonalDataServer" }),
              let url = URL(string: entry.serviceEndpoint), url.scheme == "https" else { return nil }
        return url
    }

    /// Whether the document names `handle` back, which is what makes the handle trustworthy.
    func confirms(handle: String) -> Bool {
        alsoKnownAs?.contains { $0.lowercased() == "at://\(handle)" } ?? false
    }
}

struct BlueskyProtectedResource: Decodable {
    let authorizationServers: [String]
}

struct BlueskyAuthorizationServer: Decodable {
    let issuer: String
    let authorizationEndpoint: URL
    let tokenEndpoint: URL
    let pushedAuthorizationRequestEndpoint: URL
    let revocationEndpoint: URL?
}

struct BlueskyPushedRequest: Decodable {
    let requestUri: String
}

struct BlueskyTokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int?
    let scope: String?
    let sub: String
}

/// The input of `com.atproto.repo.createRecord` for a post.
struct BlueskyCreateRecord: Encodable {
    let repo: String
    let collection = "app.bsky.feed.post"
    let record: BlueskyPostRecord
}

/// An `app.bsky.feed.post` record: its text, facets and creation time.
struct BlueskyPostRecord: Encodable {
    let type = "app.bsky.feed.post"
    let text: String
    let facets: [BlueskyFacet]?
    /// ISO 8601, which the lexicon requires as a datetime string.
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case type = "$type"
        case text, facets, createdAt
    }
}

/// `app.bsky.actor.getProfile`, the part shown in Settings.
struct BlueskyProfile: Decodable {
    let did: String
    let handle: String
    let displayName: String?
    let avatar: URL?
}
