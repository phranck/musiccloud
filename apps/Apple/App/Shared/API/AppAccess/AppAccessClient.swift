//
//  AppAccessClient.swift
//  musiccloud
//

import Foundation

// MARK: - AppAccessClient

/// Talks to the backend's App Attest routes under `/api/app/`.
///
/// These routes are not published. The backend accepts a session only from
/// a build of this app that Apple's App Attest vouches for, and converts
/// for that session without a rate limit. ``AppSession`` decides when each
/// call is made; this type only builds the requests and reads the answers.
enum AppAccessClient {
    /// The backend's answer to a request, reduced to what ``AppSession`` acts on.
    enum Failure: Error, Equatable {
        /// `MC-AUTH-0005`: the token is missing, expired or revoked.
        case sessionInvalid
        /// `MC-AUTH-0006`: the challenge is unknown, expired or used.
        case challengeRejected
        /// `MC-AUTH-0007`: the attestation or assertion did not verify.
        case proofRejected
        /// `MC-AUTH-0008`: the backend does not know the key or revoked it.
        case keyUnknown
        /// `MC-REQ-0009`: the key is attested already, so it renews instead.
        case keyAlreadyAttested
        /// Anything else, including transport errors and rate limits.
        case unavailable
    }

    /// The backend codes that map onto a ``Failure`` other than ``Failure/unavailable``.
    static func failure(forCode code: String) -> Failure {
        switch code {
        case "MC-AUTH-0005": .sessionInvalid
        case "MC-AUTH-0006": .challengeRejected
        case "MC-AUTH-0007": .proofRejected
        case "MC-AUTH-0008": .keyUnknown
        case "MC-REQ-0009":  .keyAlreadyAttested
        default:             .unavailable
        }
    }
}

// MARK: - Requests

extension AppAccessClient {
    /// `POST /api/app/challenge`. The backend refuses a JSON content type
    /// without a body, so this request carries neither.
    static func challengeRequest(base: URL) -> URLRequest {
        var request = URLRequest(url: base.appending(path: "api/app/challenge"))
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        return request
    }

    /// `POST /api/app/attest` with the key id, the attestation object and the challenge it signs.
    static func attestRequest(base: URL, keyId: String, attestation: Data, challenge: String) throws -> URLRequest {
        try jsonRequest(base: base, path: "api/app/attest", body: [
            "keyId": keyId,
            "attestation": attestation.base64EncodedString(),
            "challenge": challenge,
        ])
    }

    /// `POST /api/app/session` with an assertion over a fresh challenge.
    static func sessionRequest(base: URL, keyId: String, assertion: Data, challenge: String) throws -> URLRequest {
        try jsonRequest(base: base, path: "api/app/session", body: [
            "keyId": keyId,
            "assertion": assertion.base64EncodedString(),
            "challenge": challenge,
        ])
    }

    /// `POST /api/app/resolve` with the session token. The answer has the
    /// shape of `POST /api/resolve`.
    static func resolveRequest(base: URL, query: String, token: String) throws -> URLRequest {
        var request = try jsonRequest(base: base, path: "api/app/resolve", body: ["query": query])
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private static func jsonRequest(base: URL, path: String, body: [String: String]) throws -> URLRequest {
        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }
}

// MARK: - Calls

extension AppAccessClient {
    private struct ChallengeResponse: Decodable {
        let challenge: String
    }

    /// Fetches a one-time challenge, valid for five minutes.
    @concurrent
    static func fetchChallenge(base: URL) async throws(Failure) -> String {
        let data = try await send(challengeRequest(base: base))
        do {
            return try JSONDecoder().decode(ChallengeResponse.self, from: data).challenge
        } catch {
            throw .unavailable
        }
    }

    /// Sends a request whose answer is a session token.
    @concurrent
    static func fetchToken(_ request: URLRequest) async throws(Failure) -> AppSessionToken {
        let data = try await send(request)
        do {
            return try JSONDecoder.appSession.decode(SessionResponse.self, from: data).token
        } catch {
            throw .unavailable
        }
    }

    private struct SessionResponse: Decodable {
        let token: AppSessionToken

        private enum CodingKeys: String, CodingKey { case token, expiresAt }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            token = AppSessionToken(
                value: try container.decode(String.self, forKey: .token),
                expiresAt: try container.decode(Date.self, forKey: .expiresAt)
            )
        }
    }

    /// Sends a request and returns the body of a 2xx answer.
    static func send(_ request: URLRequest) async throws(Failure) -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            AppLogger.api.error("App access: transport failed: \(error.localizedDescription)")
            throw .unavailable
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let code = (try? JSONDecoder().decode(APIError.self, from: data))?.error ?? ""
            AppLogger.api.error("App access: HTTP \(status) \(code)")
            throw failure(forCode: code)
        }
        return data
    }
}
