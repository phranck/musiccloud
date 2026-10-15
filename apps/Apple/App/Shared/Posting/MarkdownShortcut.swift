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
/// selected or stand just outside. A quote puts `> ` before every line the
/// selection touches, or takes it away when all of them have it. A link
/// turns the selection into `[text](url)`: with a URL on the clipboard that
/// URL is filled in, otherwise `url` is selected, which is the part still to
/// be typed. Ranges are `NSRange` over UTF-16, which is what `NSTextView` takes.
enum MarkdownShortcut: Sendable, CaseIterable {
    case bold
    case italic
    case code
    case link
    case quote

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
        case "'": self = .quote
        default: return nil
        }
    }

    /// The change this shortcut makes to `text` with `selection`.
    ///
    /// - Parameter clipboard: What the clipboard holds; a link takes it as
    ///   its URL when it is an `http` or `https` URL.
    func edit(in text: String, selection: NSRange, clipboard: String? = nil) -> Edit {
        let source = text as NSString
        let selected = source.substring(with: selection)
        switch self {
        case .bold:   return Self.toggle("**", in: source, selection: selection, selected: selected)
        case .italic: return Self.toggle("*", in: source, selection: selection, selected: selected)
        case .code:   return Self.toggle("`", in: source, selection: selection, selected: selected)
        case .quote:  return Self.toggleQuote(in: source, selection: selection)
        case .link:   return Self.link(selected, selection: selection, url: clipboard.flatMap(Self.webURL))
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

    /// Quotes the lines the selection touches, or unquotes them when all are quoted.
    static func toggleQuote(in source: NSString, selection: NSRange) -> Edit {
        let lineRange = source.lineRange(for: selection)
        var block = source.substring(with: lineRange)
        let endsWithNewline = block.hasSuffix("\n")
        if endsWithNewline {
            block.removeLast()
        }
        let lines = block.components(separatedBy: "\n")
        let isQuoted = lines.allSatisfy { $0.hasPrefix(">") }
        let changed = lines.map { line -> String in
            guard isQuoted else { return "> " + line }
            return line.hasPrefix("> ") ? String(line.dropFirst(2)) : String(line.dropFirst())
        }.joined(separator: "\n")
        return Edit(range: lineRange, replacement: changed + (endsWithNewline ? "\n" : ""),
                    selection: NSRange(location: lineRange.location, length: (changed as NSString).length))
    }

    /// `[selected](url)`, with the URL filled in when there is one.
    static func link(_ selected: String, selection: NSRange, url: String?) -> Edit {
        let target = url ?? "url"
        let replacement = "[\(selected)](\(target))"
        let after: NSRange = if selected.isEmpty {
            // The text is what is still missing.
            NSRange(location: selection.location + 1, length: 0)
        } else if url != nil {
            // Nothing is missing, so the cursor goes behind the link.
            NSRange(location: selection.location + (replacement as NSString).length, length: 0)
        } else {
            NSRange(location: selection.location + (selected as NSString).length + 3, length: (target as NSString).length)
        }
        return Edit(range: selection, replacement: replacement, selection: after)
    }

    /// `text` when it is one `http` or `https` URL with a host, without surrounding whitespace.
    static func webURL(_ text: String) -> String? {
        let candidate = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !candidate.contains(where: \.isWhitespace), let url = URL(string: candidate),
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https", url.host() != nil
        else { return nil }
        return candidate
    }
}
