//
//  TemplateCompletion.swift
//  musiccloud
//

import Foundation

// MARK: - TemplateCompletion

/// Completes a variable the user is typing, from `{` up to the cursor.
///
/// The editor asks for the range being completed and for the candidates;
/// accepting a candidate replaces that range with the whole `{name}`, so a
/// closing brace already typed after the cursor is not doubled.
enum TemplateCompletion {
    /// The range from an opening `{` to `cursor`, when only placeholder
    /// characters stand between them.
    ///
    /// - Parameters:
    ///   - text: The template body.
    ///   - cursor: The insertion point, a UTF-16 offset.
    /// - Returns: The range to replace, or `nil` when the cursor is not inside an unfinished placeholder.
    static func partialRange(in text: String, cursor: Int) -> NSRange? {
        let string = text as NSString
        guard cursor <= string.length else { return nil }
        var index = cursor
        while index > 0 {
            let character = string.character(at: index - 1)
            if character == openingBrace {
                let range = NSRange(location: index - 1, length: cursor - index + 1)
                // A closing brace right after the cursor belongs to the placeholder.
                if cursor < string.length, string.character(at: cursor) == closingBrace {
                    return NSRange(location: range.location, length: range.length + 1)
                }
                return range
            }
            guard isNameCharacter(character) else { return nil }
            index -= 1
        }
        return nil
    }

    /// The placeholders that start with what was typed after `{`, in the order given.
    ///
    /// - Parameters:
    ///   - partial: The text of ``partialRange(in:cursor:)``, starting with `{`.
    ///   - tokens: Every placeholder offered, such as `{song_name}`.
    static func candidates(for partial: String, from tokens: [String]) -> [String] {
        let typed = partial.drop { $0 == "{" }.prefix { $0 != "}" }
        guard !typed.isEmpty else { return tokens }
        return tokens.filter { $0.dropFirst().hasPrefix(typed) }
    }

    /// Every placeholder for the editor: the variables, then one per service link.
    static func tokens(serviceLinks: [ServiceLink]) -> [String] {
        PostVariable.allCases.map(\.token)
            + serviceLinks.map { "{\($0.service)\(PostTemplateRenderer.serviceLinkSuffix)}" }
    }
}

private extension TemplateCompletion {
    static let openingBrace = unichar(UInt8(ascii: "{"))
    static let closingBrace = unichar(UInt8(ascii: "}"))

    /// Lowercase ASCII letters, digits and the underscore, as in `{song_name}`.
    static func isNameCharacter(_ character: unichar) -> Bool {
        switch character {
        case unichar(UInt8(ascii: "a"))...unichar(UInt8(ascii: "z")),
             unichar(UInt8(ascii: "0"))...unichar(UInt8(ascii: "9")),
             unichar(UInt8(ascii: "_")):
            true
        default:
            false
        }
    }
}
