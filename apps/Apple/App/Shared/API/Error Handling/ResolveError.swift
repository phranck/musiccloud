//
//  ResolveError.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import Foundation

/// Errors that can occur when resolving a streaming URL.
///
/// Provides localized error descriptions for display to users.
/// Each error case maps to a specific failure scenario in the URL resolution process.
///
/// ## Topics
///
/// ### Error Cases
/// - ``rateLimited``
/// - ``invalidURL``
/// - ``networkError``
/// - ``serviceDown``
/// - ``httpError(_:)``
/// - ``invalidResponse``
/// - ``unknown(_:)``
///
/// ### Error Description
/// - ``errorDescription``
enum ResolveError: LocalizedError, Equatable {
    /// Request was rate-limited by the API (HTTP 429)
    case rateLimited
    /// The provided URL is not a valid streaming service URL
    case invalidURL
    /// Network connection failed
    case networkError
    /// The musiccloud.io service is currently unavailable
    case serviceDown
    /// HTTP error with specific status code
    /// - Parameter code: The HTTP status code
    case httpError(Int)
    /// The backend answered with a short link that does not point at musiccloud
    case invalidResponse
    /// Unknown error with custom message
    /// - Parameter message: Description of the error
    case unknown(String)
}

// MARK: - Public API

extension ResolveError {
    /// Returns a localized, user-friendly error description.
    ///
    /// Error messages are localized through the app's `Localizable.xcstrings` catalog.
    var errorDescription: String? {
        switch self {
        case .rateLimited:       String(localized: "error.rate_limited")
        case .invalidURL:        String(localized: "error.invalid_url")
        case .networkError:      String(localized: "error.network")
        case .serviceDown:       String(localized: "error.service_down")
        case .httpError(let code):  "\(String(localized: "error.server")) (\(code))"
        case .invalidResponse:   String(localized: "error.server")
        case .unknown(let msg):  msg
        }
    }
}

// MARK: - Mapping

extension ResolveError {
    /// Wraps any error a conversion can end in.
    ///
    /// The interface decides what to show by the case, for example the rate
    /// limit card, so a transport failure has to arrive as a case rather than
    /// as Foundation's description of it.
    ///
    /// - Parameter error: The error thrown while resolving.
    init(_ error: any Error) {
        switch error {
        case let resolveError as ResolveError: self = resolveError
        case is URLError: self = .networkError
        case is DecodingError: self = .invalidResponse
        default: self = .unknown(error.localizedDescription)
        }
    }
}
