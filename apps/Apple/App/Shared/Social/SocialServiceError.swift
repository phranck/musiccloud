//
//  SocialServiceError.swift
//  musiccloud
//

import Foundation

// MARK: - SocialServiceError

/// Why a request to Mastodon or Bluesky failed, worded for the user.
enum SocialServiceError: LocalizedError, Equatable {
    /// What the user typed names no server or account.
    case invalidInput(String)
    /// The server answered with a status outside 2xx.
    case refused(status: Int)
    /// The sign-in came back without a code, or for another request.
    case missingCode
    /// The answer was not what the protocol promises.
    case unexpectedAnswer
    /// The account that signed in is not the one that was asked for.
    case accountMismatch
    /// The account's session is gone or can no longer be renewed.
    case signedOut

    var errorDescription: String? {
        switch self {
        case .invalidInput(let message): message
        case .refused(let status): String(localized: "The server refused the request (HTTP \(status)).")
        case .missingCode: String(localized: "The server did not return a sign-in code.")
        case .unexpectedAnswer: String(localized: "The server's answer could not be read.")
        case .accountMismatch: String(localized: "The server signed in a different account than the one you entered.")
        case .signedOut: String(localized: "The account is signed out. Connect it again.")
        }
    }
}

extension URLSession {
    /// Sends `request` and fails with ``SocialServiceError/refused(status:)`` on any status outside 2xx.
    func checkedData(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (body, response) = try await data(for: request)
        guard let http = response as? HTTPURLResponse
        else {
            throw SocialServiceError.unexpectedAnswer
        }
        guard (200..<300).contains(http.statusCode)
        else {
            throw SocialServiceError.refused(status: http.statusCode)
        }
        return (body, http)
    }

    /// Sends `request` and decodes the answer as `type`.
    func decoded<Answer: Decodable>(
        _ type: Answer.Type,
        for request: URLRequest,
        decoder: JSONDecoder = JSONDecoder()
    ) async throws -> Answer {
        let (body, _) = try await checkedData(for: request)
        guard let answer = try? decoder.decode(type, from: body)
        else {
            throw SocialServiceError.unexpectedAnswer
        }
        return answer
    }
}
