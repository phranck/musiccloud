//
//  AppSessionStore.swift
//  musiccloud
//

import Foundation

// MARK: - AppSessionToken

/// A session the backend issued after it verified the app with App Attest.
struct AppSessionToken: Codable, Equatable, Sendable {
    /// The bearer token sent with `POST /api/app/resolve`.
    let value: String
    /// When the backend stops accepting the token.
    let expiresAt: Date
}

// MARK: - AppSessionStore

/// Keeps the App Attest key id and the current session token in the Keychain.
///
/// On iOS both items live in the access group of the app group
/// `group.io.musiccloud`, because the Share Extension cannot use App Attest
/// and converts with the token the app stored last. On macOS there is no
/// extension that converts, so the items stay in the app's own Keychain.
enum AppSessionStore {
    private static let keyIdAccount = "attest-key-id"
    private static let tokenAccount = "session-token"

    #if os(iOS)
    /// An app group identifier is a valid Keychain access group on iOS,
    /// so the app and the Share Extension share these items without a
    /// separate Keychain entitlement.
    private static let items = KeychainItems(service: "io.musiccloud.app-session", accessGroup: SharedStoreConfiguration.appGroupIdentifier)
    #else
    private static let items = KeychainItems(service: "io.musiccloud.app-session", accessGroup: nil)
    #endif

    /// The id of the App Attest key this installation attested with `backend`, if any.
    static func keyId(for backend: URL) -> String? {
        items.data(for: account(keyIdAccount, backend)).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// Stores or, with `nil`, forgets the key id for `backend`.
    static func setKeyId(_ keyId: String?, for backend: URL) {
        items.setData(keyId.map { Data($0.utf8) }, for: account(keyIdAccount, backend))
    }

    /// The session `backend` issued last, if any.
    static func token(for backend: URL) -> AppSessionToken? {
        items.data(for: account(tokenAccount, backend)).flatMap { try? JSONDecoder.appSession.decode(AppSessionToken.self, from: $0) }
    }

    /// Stores or, with `nil`, forgets the session for `backend`.
    static func setToken(_ token: AppSessionToken?, for backend: URL) {
        items.setData(token.flatMap { try? JSONEncoder.appSession.encode($0) }, for: account(tokenAccount, backend))
    }

    /// The Keychain account for an item that belongs to one backend.
    ///
    /// A Debug and a Release build share the bundle identifier and therefore
    /// the Keychain, while each backend knows only its own keys and accepts
    /// only its own tokens. Scoping by host and port keeps a token from the
    /// local backend away from production.
    static func account(_ item: String, _ backend: URL) -> String {
        let host = backend.host() ?? "unknown"
        let port = backend.port.map { ":\($0)" } ?? ""
        return "\(item)@\(host)\(port)"
    }
}

// MARK: - Coding

extension JSONEncoder {
    /// Encodes dates the way the backend writes them, ISO 8601 with fractional seconds.
    static var appSession: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(date.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true)))
        }
        return encoder
    }
}

extension JSONDecoder {
    /// Decodes the backend's ISO 8601 dates, with or without fractional seconds.
    static var appSession: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = try? Date(text, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)) { return date }
            if let date = try? Date(text, strategy: .iso8601) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Not an ISO 8601 date: \(text)"))
        }
        return decoder
    }
}
