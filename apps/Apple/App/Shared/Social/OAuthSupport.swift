//
//  OAuthSupport.swift
//  musiccloud
//

import CryptoKit
import Foundation

// MARK: - OAuthSupport

/// The OAuth pieces Mastodon and Bluesky share: PKCE, URL-safe Base64 and
/// form-encoded requests.
enum OAuthSupport {
    /// A random PKCE code verifier, 43 characters of the URL-safe alphabet.
    static func makeCodeVerifier() -> String { base64URL(randomBytes(32)) }

    /// The S256 code challenge for `verifier`.
    static func codeChallenge(for verifier: String) -> String { base64URL(Data(SHA256.hash(data: Data(verifier.utf8)))) }

    /// `count` random bytes from the system's secure generator.
    static func randomBytes(_ count: Int) -> Data { Data((0..<count).map { _ in UInt8.random(in: .min ... .max) }) }

    /// Base64 with `-` and `_` instead of `+` and `/`, and no padding, as JWTs and PKCE use it.
    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(
            of: "=",
            with: ""
        )
    }

    /// A POST to `url` with `fields` form-encoded in their order.
    static func formRequest(_ url: URL, _ fields: [(String, String)]) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(
            fields.map { name, value in "\(name)=\(value.addingPercentEncoding(withAllowedCharacters: formValueCharacters) ?? "")" }.joined(
                separator: "&"
            ).utf8
        )
        return request
    }

    /// The characters a form value keeps as they are; everything else,
    /// including `+` and `&`, is percent-encoded.
    private static let formValueCharacters = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    )
}
