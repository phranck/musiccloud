//
//  DPoPKey.swift
//  musiccloud
//

import CryptoKit
import Foundation

// MARK: - DPoPKey

/// The key that binds a Bluesky session's tokens to this device (RFC 9449).
///
/// Every request with a token carries a proof signed by this key, so a
/// token that leaks is useless without it. The AT Protocol requires ES256,
/// a new key for every sign-in, and that the key never leaves the device;
/// it is kept in the Keychain with the session, which is not synchronized.
struct DPoPKey: Sendable {
    let privateKey: P256.Signing.PrivateKey  // gitleaks:allow (a type, not a secret)

    /// A new key for a new sign-in.
    init() { privateKey = P256.Signing.PrivateKey() }

    /// The key stored as ``rawRepresentation``.
    init(rawRepresentation: Data) throws { privateKey = try P256.Signing.PrivateKey(rawRepresentation: rawRepresentation) }

    /// The private key's bytes, for the Keychain.
    var rawRepresentation: Data { privateKey.rawRepresentation }

    /// The public key as the JWK the proof's header carries.
    var publicJWK: [String: String] {
        // The x963 form is 0x04 followed by the 32-byte x and y coordinates.
        let point = privateKey.publicKey.x963Representation
        return [
            "kty": "EC", "crv": "P-256", "x": OAuthSupport.base64URL(point.subdata(in: 1..<33)),
            "y": OAuthSupport.base64URL(point.subdata(in: 33..<65)),
        ]
    }

    /// A proof for one request.
    ///
    /// - Parameters:
    ///   - method: The request's HTTP method, such as `POST`.
    ///   - url: The request's URL; query and fragment are left out of the proof, as RFC 9449 says.
    ///   - nonce: The server's latest `DPoP-Nonce`, once it has sent one.
    ///   - accessToken: The token the request carries, which the proof then names by its hash.
    ///   - now: The time the proof is issued at.
    /// - Returns: The signed JWT for the `DPoP` header.
    func proof(method: String, url: URL, nonce: String?, accessToken: String? = nil, now: Date = .now) throws -> String {
        let header: [String: Any] = ["typ": "dpop+jwt", "alg": "ES256", "jwk": publicJWK]
        var claims: [String: Any] = [
            "jti": UUID().uuidString, "htm": method, "htu": Self.targetURI(url), "iat": Int(now.timeIntervalSince1970),
        ]
        if let nonce { claims["nonce"] = nonce }
        if let accessToken { claims["ath"] = OAuthSupport.base64URL(Data(SHA256.hash(data: Data(accessToken.utf8)))) }
        let signingInput = try Self.segment(header) + "." + Self.segment(claims)
        // CryptoKit's raw form of an ECDSA signature is r followed by s, which is what JWS ES256 expects.
        let signature = try privateKey.signature(for: Data(signingInput.utf8))
        return signingInput + "." + OAuthSupport.base64URL(signature.rawRepresentation)
    }

    /// `url` without query and fragment.
    static func targetURI(_ url: URL) -> String {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        components?.query = nil
        components?.fragment = nil
        return components?.string ?? url.absoluteString
    }

    private static func segment(_ object: [String: Any]) throws -> String {
        OAuthSupport.base64URL(try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]))
    }
}
