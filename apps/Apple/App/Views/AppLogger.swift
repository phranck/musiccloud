//
//  AppLogger.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import OSLog

// MARK: - AppLogger

/// Centralized logging system for the musiccloud application.
///
/// `AppLogger` provides categorized loggers for different parts of the application,
/// making it easier to filter and debug specific components.
///
/// ## Usage
///
/// ```swift
/// AppLogger.ui.debug("Button tapped")
/// AppLogger.api.info("Request sent to \(url)")
/// AppLogger.clipboard.error("Failed to process: \(error)")
/// ```
///
/// ## Console.app Filtering
///
/// In Console.app, filter by:
/// - **Subsystem**: `io.musiccloud.app`
/// - **Category**: `UI`, `ClipboardMonitor`, `API`, or `History`
enum AppLogger {

    /// The application subsystem identifier
    private static let subsystem = "io.musiccloud.app"

    /// Logger for UI-related events and interactions
    static let ui = Logger(subsystem: subsystem, category: "UI") // swiftlint:disable:this identifier_name

    /// Logger for clipboard monitoring and URL detection
    static let clipboard = Logger(subsystem: subsystem, category: "ClipboardMonitor")

    /// Logger for network requests and API interactions
    static let api = Logger(subsystem: subsystem, category: "API")

    /// Logger for history management operations
    static let history = Logger(subsystem: subsystem, category: "History")
}
