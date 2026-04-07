//
//  APIError.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import Foundation

/// Error response from the musiccloud.io API.
///
/// Contains error code and human-readable message when an API request fails.
///
/// ## Topics
///
/// ### Properties
/// - ``error``
/// - ``message``
struct APIError: Decodable {
    /// Machine-readable error code (e.g., "INVALID_URL", "RATE_LIMITED")
    var error: String
    /// Human-readable error message
    var message: String
}
