//
//  MarkdownShortcut.swift
//  musiccloud
//

import Foundation

// MARK: - MarkdownShortcut

/// A formatting shortcut of the Template Editor and the change it makes to
/// the text, worked out without a text view so it can be tested.
///
/// Bold, italic and code wrap the selection in their marker, or remove the
/// marker when the selection is wrapped already, whether the markers are
/// selected or stand just outside. A link turns the selection into
/// `[text](url)` and selects `url`, which is the part still to be typed.
/// Ranges are `NSRange` over UTF-16, which is what `NSTextView` takes.
enum MarkdownShortcut: Sendable, CaseIterable {
    case bold
    case italic
    case code
    case link

    /// One replacement and the selection afterwards.
    struct Edit: Equatable, Sendable {
        /// The range of the current text that is replaced.
        let range: NSRange
        let replacement: String
        /// The selection once `replacement` stands in the text.
        let selection: NSRange
    }

    /// The shortcut for a key pressed together with Command, such as `b` for bold.
    init?(commandKey: String) {
        switch commandKey.lowercased() {
        case "b": self = .bold
        case "i": self = .italic
        case "e": self = .code
        case "k": self = .link
        default: return nil
        }
    }

    /// The change this shortcut makes to `text` with `selection`.
    func edit(in text: String, selection: NSRange) -> Edit {
        let source = text as NSString
        let selected = source.substring(with: selection)
        switch self {
        case .bold:   return Self.toggle("**", in: source, selection: selection, selected: selected)
        case .italic: return Self.toggle("*", in: source, selection: selection, selected: selected)
        case .code:   return Self.toggle("`", in: source, selection: selection, selected: selected)
        case .link:
            let placeholder = "url"
            let replacement = "[\(selected)](\(placeholder))"
            let selectionAfter = selected.isEmpty
                ? NSRange(location: selection.location + 1, length: 0)
                : NSRange(location: selection.location + (selected as NSString).length + 3, length: (placeholder as NSString).length)
            return Edit(range: selection, replacement: replacement, selection: selectionAfter)
        }
    }
}

private extension MarkdownShortcut {
    static func toggle(_ marker: String, in source: NSString, selection: NSRange, selected: String) -> Edit {
        let width = (marker as NSString).length
        let selectedLength = (selected as NSString).length

        // The markers are part of the selection.
        if selectedLength >= 2 * width, selected.hasPrefix(marker), selected.hasSuffix(marker),
           !isPartOfLongerMarker(marker, at: selection.location, in: source) {
            let inner = (selected as NSString).substring(with: NSRange(location: width, length: selectedLength - 2 * width))
            return Edit(range: selection, replacement: inner, selection: NSRange(location: selection.location, length: (inner as NSString).length))
        }

        // The markers stand just outside the selection.
        let before = NSRange(location: selection.location - width, length: width)
        let after = NSRange(location: NSMaxRange(selection), length: width)
        if before.location >= 0, NSMaxRange(after) <= source.length,
           source.substring(with: before) == marker, source.substring(with: after) == marker,
           !isPartOfLongerMarker(marker, at: before.location, in: source) {
            return Edit(range: NSRange(location: before.location, length: selectedLength + 2 * width),
                        replacement: selected,
                        selection: NSRange(location: before.location, length: selectedLength))
        }

        return Edit(range: selection, replacement: marker + selected + marker,
                    selection: NSRange(location: selection.location + width, length: selectedLength))
    }

    /// Whether the `*` at `location` belongs to a `**`, so italic leaves bold alone.
    static func isPartOfLongerMarker(_ marker: String, at location: Int, in source: NSString) -> Bool {
        guard marker == "*" else { return false }
        let neighbours = [location - 1, location + 1].filter { $0 >= 0 && $0 < source.length }
        return neighbours.contains { source.substring(with: NSRange(location: $0, length: 1)) == "*" }
    }
}
