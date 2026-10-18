//
//  BlueskyAccount.swift
//  musiccloud
//

import Foundation

// MARK: - BlueskyAccount

/// A Bluesky account the user connected, as listed in Settings.
///
/// The session with its tokens and DPoP key is not part of this value. It
/// lives in the Keychain under ``id``.
struct BlueskyAccount: Codable, Identifiable, Hashable, Sendable {
    /// The account's DID, which stays the same when the handle changes.
    let did: String
    let handle: String
    let displayName: String
    let avatarURL: URL?
    /// The account's server, where posts are written.
    let pds: URL

    var id: String { did }

    /// The handle as people write it, such as `@musiccloud.io`.
    var displayHandle: String { "@\(handle)" }

    /// The name to show, falling back to the handle when the profile has none.
    var name: String { displayName.isEmpty ? handle : displayName }
}

// MARK: - BlueskySession

/// What a signed-in Bluesky account needs to make requests: its tokens,
/// the DPoP key they are bound to, and where to renew them.
struct BlueskySession: Codable, Sendable {
    var accessToken: String
    var refreshToken: String?
    /// When the access token stops working, if the server said.
    var expiresAt: Date?
    /// The DPoP private key's bytes; see ``DPoPKey``.
    let dpopKey: Data
    let issuer: String
    let tokenEndpoint: URL
    let revocationEndpoint: URL?

    /// Whether the access token ends within `margin`, so it is renewed before a request rather than after a refusal.
    func expires(within margin: TimeInterval, from now: Date = .now) -> Bool {
        guard let expiresAt
        else {
            return false
        }
        return expiresAt.timeIntervalSince(now) < margin
    }
}
