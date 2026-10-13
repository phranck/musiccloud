import Foundation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - Pasteboard

/// The system clipboard, the same way on macOS and iOS.
///
/// Reading and writing go through here so the app, its views and the Share
/// Extension treat the clipboard alike. On macOS a write clears the
/// pasteboard first, which drops every other representation the previous
/// content had.
@MainActor
enum Pasteboard {
    /// The plain text on the clipboard, or `nil` when it holds none.
    static var string: String? {
        #if os(macOS)
        NSPasteboard.general.string(forType: .string)
        #else
        UIPasteboard.general.string
        #endif
    }

    /// Replaces the clipboard's content with a string.
    ///
    /// - Parameter string: The text to put on the clipboard.
    static func copy(_ string: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(string, forType: .string)
        #else
        UIPasteboard.general.string = string
        #endif
    }
}
