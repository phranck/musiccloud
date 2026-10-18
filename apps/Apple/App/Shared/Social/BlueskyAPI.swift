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

    /// The domain of a handle given as a bare name, such as `phranck`.
    static let defaultHandleDomain = "bsky.social"

    /// Whether `scalar` can stand in a lowercased handle: an ASCII letter, a digit, `.` or `-`.
    ///
    /// Compared by value rather than through a `CharacterSet`: in the optimized
    /// build a `CharacterSet` lookup here rejected every handle, while the
    /// unoptimized build accepted them.
    static func isHandleCharacter(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x61...0x7A, 0x30...0x39, 0x2E, 0x2D: true
        default: false
        }
    }

    /// The handle a user means, without `@` and in lowercase, or `nil` when it cannot be one.
    ///
    /// Text copied from a web page carries invisible format characters, such
    /// as the direction marks around a handle on bsky.app, so format and
    /// control characters are dropped first. A profile link such as
    /// `https://bsky.app/profile/name.bsky.social` names the handle as well.
    static func handle(from input: String) -> String? {
        var visible = String.UnicodeScalarView()
        for scalar in input.unicodeScalars {
            let category = scalar.properties.generalCategory
            if category != .format && category != .control { visible.append(scalar) }
        }
        var text = String(visible).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let profile = text.range(of: "/profile/") {
            text = String(text[profile.upperBound...]).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        if text.hasPrefix("@") { text.removeFirst() }
        // A bare name is a handle on Bluesky's own domain, as the field shows beside it.
        if !text.isEmpty, !text.contains(".") { text += "." + defaultHandleDomain }
        guard
            text.contains("."),
            !text.hasPrefix("."),
            !text.hasSuffix("."),
            text.unicodeScalars.allSatisfy(isHandleCharacter)
        else {
            return nil
        }
        return text
    }

    // MARK: Discovery

    /// The handle's own answer, which a handle verified over HTTPS gives.
    static func wellKnownDIDURL(handle: String) -> URL? { URL(string: "https://\(handle)/.well-known/atproto-did") }

    /// The public API's lookup, which also covers handles verified by DNS.
    static func resolveHandleURL(handle: String) -> URL {
        publicAPI.appending(path: "xrpc/com.atproto.identity.resolveHandle").appending(queryItems: [
            URLQueryItem(name: "handle", value: handle)
        ])
    }

    /// Where the DID document of `did` is published: the PLC directory for
    /// `did:plc`, the host's well-known path for `did:web`.
    static func didDocumentURL(did: String) -> URL? {
        if did.hasPrefix("did:plc:") { return URL(string: "https://plc.directory/\(did)") }
        if did.hasPrefix("did:web:") {
            let host = String(did.dropFirst("did:web:".count))
            guard !host.contains(":")
            else {
                return nil
            }
            return URL(string: "https://\(host)/.well-known/did.json")
        }
        return nil
    }

    static func protectedResourceURL(pds: URL) -> URL { pds.appending(path: ".well-known/oauth-protected-resource") }

    static func authorizationServerMetadataURL(issuer: URL) -> URL { issuer.appending(path: ".well-known/oauth-authorization-server") }

    /// The profile with display name and avatar.
    static func profileURL(did: String) -> URL {
        publicAPI.appending(path: "xrpc/app.bsky.actor.getProfile").appending(queryItems: [URLQueryItem(name: "actor", value: did)])
    }

    // MARK: OAuth

    /// The pushed authorization request, which the authorization page then refers to.
    static func pushedAuthorizationRequest(endpoint: URL, state: String, codeChallenge: String, loginHint: String) -> URLRequest {
        OAuthSupport.formRequest(
            endpoint,
            [
                ("client_id", clientID), ("response_type", "code"), ("redirect_uri", redirectURI), ("scope", scope), ("state", state),
                ("code_challenge", codeChallenge), ("code_challenge_method", "S256"), ("login_hint", loginHint),
            ]
        )
    }

    /// The page where the user signs in, which only names the pushed request.
    static func authorizeURL(endpoint: URL, requestURI: String) -> URL {
        endpoint.appending(queryItems: [
            URLQueryItem(name: "client_id", value: clientID), URLQueryItem(name: "request_uri", value: requestURI),
        ])
    }

    static func tokenRequest(endpoint: URL, code: String, codeVerifier: String) -> URLRequest {
        OAuthSupport.formRequest(
            endpoint,
            [
                ("grant_type", "authorization_code"), ("code", code), ("redirect_uri", redirectURI), ("code_verifier", codeVerifier),
                ("client_id", clientID),
            ]
        )
    }

    static func refreshRequest(endpoint: URL, refreshToken: String) -> URLRequest {
        OAuthSupport.formRequest(endpoint, [("grant_type", "refresh_token"), ("refresh_token", refreshToken), ("client_id", clientID)])
    }

    static func revokeRequest(endpoint: URL, token: String) -> URLRequest {
        OAuthSupport.formRequest(endpoint, [("token", token), ("client_id", clientID)])
    }

    // MARK: Posting

    /// The largest image a link card's thumbnail may be, per Bluesky's guide to creating posts.
    static let thumbnailByteLimit = 1_000_000

    /// Writes `post` as an `app.bsky.feed.post` record into the account's repository on its PDS.
    ///
    /// - Parameter card: A link preview to show under the text, see ``BlueskyExternalEmbed``.
    static func createPostRequest(
        pds: URL,
        did: String,
        post: BlueskyPostText,
        createdAt: Date,
        card: BlueskyExternalEmbed? = nil
    ) -> URLRequest {
        var request = URLRequest(url: pds.appending(path: "xrpc/com.atproto.repo.createRecord"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(
            BlueskyCreateRecord(
                repo: did,
                record: BlueskyPostRecord(
                    text: post.text,
                    facets: post.facets.isEmpty ? nil : post.facets,
                    createdAt: createdAt.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true)),
                    embed: card
                )
            )
        )
        return request
    }

    /// Fetches a linked page to read its preview tags.
    ///
    /// It says it is a link preview fetcher, which it is. musiccloud's share
    /// pages, like many sites, put their Open Graph tags straight into the
    /// HTML only for user agents they recognize as one (`isBot` in
    /// `apps/frontend/src/lib/isBot.ts`); a plain URLSession agent gets a
    /// page whose tags arrive later and finds none.
    static func linkPreviewRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1"
        request.setValue("musiccloud-linkpreview/\(version) (+https://musiccloud.io)", forHTTPHeaderField: "User-Agent")
        request.setValue("text/html", forHTTPHeaderField: "Accept")
        return request
    }

    /// Uploads `data`, such as a link card's image, as a blob the post can refer to.
    static func uploadBlobRequest(pds: URL, data: Data, mimeType: String) -> URLRequest {
        var request = URLRequest(url: pds.appending(path: "xrpc/com.atproto.repo.uploadBlob"))
        request.httpMethod = "POST"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        request.httpBody = data
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
struct BlueskyResolvedHandle: Decodable { let did: String }

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
        guard
            let entry = service?.first(where: { $0.id.hasSuffix("#atproto_pds") && $0.type == "AtprotoPersonalDataServer" }),
            let url = URL(string: entry.serviceEndpoint),
            url.scheme == "https"
        else {
            return nil
        }
        return url
    }

    /// Whether the document names `handle` back, which is what makes the handle trustworthy.
    func confirms(handle: String) -> Bool { alsoKnownAs?.contains { $0.lowercased() == "at://\(handle)" } ?? false }
}

struct BlueskyProtectedResource: Decodable { let authorizationServers: [String] }

struct BlueskyAuthorizationServer: Decodable {
    let issuer: String
    let authorizationEndpoint: URL
    let tokenEndpoint: URL
    let pushedAuthorizationRequestEndpoint: URL
    let revocationEndpoint: URL?
}

struct BlueskyPushedRequest: Decodable { let requestUri: String }

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

/// An `app.bsky.feed.post` record: its text, facets, creation time and an optional link card.
struct BlueskyPostRecord: Encodable {
    let type = "app.bsky.feed.post"
    let text: String
    let facets: [BlueskyFacet]?
    /// ISO 8601, which the lexicon requires as a datetime string.
    let createdAt: String
    let embed: BlueskyExternalEmbed?

    enum CodingKeys: String, CodingKey {
        case type = "$type"
        case text, facets, createdAt, embed
    }
}

/// A blob a PDS stored, as `com.atproto.repo.uploadBlob` returns it and a record refers to it.
///
/// It is passed back exactly as received, so its fields are kept as JSON.
struct BlueskyBlob: Codable, Equatable, Sendable {
    let json: [String: BlueskyJSONValue]

    init(from decoder: Decoder) throws { json = try [String: BlueskyJSONValue](from: decoder) }

    func encode(to encoder: Encoder) throws { try json.encode(to: encoder) }
}

/// A JSON value, for parts of an answer that go back unchanged.
indirect enum BlueskyJSONValue: Codable, Equatable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: BlueskyJSONValue])
    case array([BlueskyJSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([BlueskyJSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: BlueskyJSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value):
            // Sizes are integers, and a PDS rejects `760898.0` where it expects `760898`.
            if value.rounded() == value, abs(value) < 1e15 { try container.encode(Int64(value)) } else { try container.encode(value) }
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

/// `com.atproto.repo.uploadBlob`'s answer.
struct BlueskyUploadedBlob: Decodable { let blob: BlueskyBlob }

/// An `app.bsky.embed.external` link card: the page's address, title,
/// description and, when it could be uploaded, a thumbnail.
struct BlueskyExternalEmbed: Encodable, Equatable {
    struct External: Encodable, Equatable {
        let uri: String
        let title: String
        let description: String
        let thumb: BlueskyBlob?
    }

    let external: External

    private enum CodingKeys: String, CodingKey {
        case type = "$type"
        case external
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode("app.bsky.embed.external", forKey: .type)
        try container.encode(external, forKey: .external)
    }
}

/// `app.bsky.actor.getProfile`, the part shown in Settings.
struct BlueskyProfile: Decodable {
    let did: String
    let handle: String
    let displayName: String?
    let avatar: URL?
}
