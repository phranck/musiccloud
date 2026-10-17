import Foundation
#if os(macOS)
import AppKit

/// The native pasteboard type; named instances keep monitor tests off the general clipboard.
typealias SystemPasteboard = NSPasteboard
#else
import UIKit

/// The native pasteboard type; named instances keep monitor tests off the general clipboard.
typealias SystemPasteboard = UIPasteboard
#endif

// MARK: - Pasteboard

/// The system clipboard, the same way on macOS and iOS.
///
/// Reading and writing go through here so the app, its views and the Share
/// Extension treat the clipboard alike. On macOS a write clears the
/// pasteboard first, which drops every other representation the previous
/// content had.
@MainActor enum Pasteboard {
    /// Metadata observed on a Universal Clipboard item received from another device.
    private static let remoteOriginType = "com.apple.is-remote-clipboard"

    /// Whether metadata identifies the chosen board as received from another device.
    /// Automatic monitoring checks this before reading contents; explicit paste stays available.
    /// - Parameter pasteboard: The board whose advertised types are inspected without reading its text.
    /// - Returns: Whether the remote-origin marker is present in the advertised types.
    static func isRemote(_ pasteboard: SystemPasteboard) -> Bool {
        #if os(macOS)
        pasteboard.types?.contains(NSPasteboard.PasteboardType(remoteOriginType)) == true
        #else
        pasteboard.types.contains(remoteOriginType)
        #endif
    }

    /// The plain text on the clipboard, or `nil` when it holds none.
    static var string: String? { string(from: .general) }

    /// Reads plain text from the chosen pasteboard without touching another board.
    /// - Parameter pasteboard: The general pasteboard or an isolated named board.
    /// - Returns: Its plain text, or nil when the chosen board has no string representation.
    static func string(from pasteboard: SystemPasteboard) -> String? {
        #if os(macOS)
        pasteboard.string(forType: .string)
        #else
        pasteboard.string
        #endif
    }

    /// Replaces the clipboard's content with a string.
    ///
    /// - Parameters:
    ///   - string: The text to put on the clipboard.
    ///   - pasteboard: The destination. Defaults to the system general clipboard.
    static func copy(_ string: String, to pasteboard: SystemPasteboard = .general) {
        #if os(macOS)
        pasteboard.clearContents()
        pasteboard.setString(string, forType: .string)
        #else
        pasteboard.string = string
        #endif
    }
}
