import Foundation

// MARK: - PlainTextItem

/// Reads the bytes a share sheet item offers under `public.plain-text`.
///
/// Apps do not agree on what those bytes are. Most send UTF-8 text, while
/// Spotify sends a keyed archive of the string, which `NSItemProvider` cannot
/// turn into an `NSString` (error -1200). The share extension falls back to the
/// raw bytes and reads them here.
nonisolated enum PlainTextItem {
    /// The text in `data`, or `nil` when it is neither UTF-8 nor an archive of
    /// a string, a URL or an attributed string.
    ///
    /// - Parameter data: The data representation of a `public.plain-text` item.
    /// - Returns: The text, with a URL as its absolute string.
    static func text(from data: Data) -> String? {
        guard data.starts(with: Array("bplist".utf8)) else {
            return String(data: data, encoding: .utf8)
        }
        let object = try? NSKeyedUnarchiver.unarchivedObject(
            ofClasses: [NSString.self, NSURL.self, NSAttributedString.self],
            from: data
        )
        switch object {
        case let url as URL: return url.absoluteString
        case let string as String: return string
        case let attributed as NSAttributedString: return attributed.string
        default: return nil
        }
    }
}
