//
//  TemplateSyntaxHighlighter.swift
//  musiccloud
//

import Foundation

// MARK: - TemplateSyntaxHighlighter

/// Finds the Markdown and variable syntax in a template body.
///
/// It returns ranges and kinds only, so the editor decides on fonts and
/// colors and the result can be tested without a text view. Ranges are
/// `NSRange` over UTF-16, which is what `NSTextStorage` takes.
enum TemplateSyntaxHighlighter {
    /// What a range of the template is.
    enum Kind: Equatable, Sendable {
        /// A `{name}` placeholder the renderer fills.
        case variable
        /// A `{name}` placeholder that is no variable, so it renders as nothing.
        case unknownVariable
        case heading
        case bold
        case italic
        case code
        case link
        case hashtag
    }

    /// One highlighted range.
    struct Highlight: Equatable, Sendable {
        let range: NSRange
        let kind: Kind
    }

    /// The highlighted ranges of `text`, in order of the kinds above.
    ///
    /// - Parameters:
    ///   - text: The template body.
    ///   - isVariable: Whether a placeholder name, without braces, is a variable.
    static func highlights(in text: String, isVariable: (String) -> Bool) -> [Highlight] {
        let whole = NSRange(text.startIndex..., in: text)
        var result: [Highlight] = []

        for (kind, expression) in patterns {
            for match in expression.matches(in: text, range: whole) {
                result.append(Highlight(range: match.range, kind: kind))
            }
        }

        for match in placeholder.matches(in: text, range: whole) {
            let name = (text as NSString).substring(with: match.range(at: 1))
            result.append(Highlight(range: match.range, kind: isVariable(name) ? .variable : .unknownVariable))
        }
        return result
    }
}

private extension TemplateSyntaxHighlighter {
    // The patterns are fixed and valid, so building them cannot fail.
    // swiftlint:disable force_try
    static let placeholder = try! NSRegularExpression(pattern: #"\{([a-z0-9_]+)\}"#)

    static let patterns: [(Kind, NSRegularExpression)] = [
        (.heading, try! NSRegularExpression(pattern: #"^#{1,6}[ \t].*$"#, options: .anchorsMatchLines)),
        (.bold, try! NSRegularExpression(pattern: #"(\*\*|__)(?=\S)[^\n]+?(?<=\S)\1"#)),
        (.italic, try! NSRegularExpression(pattern: #"(?<![*_\w])([*_])(?=\S)[^*_\n]+?(?<=\S)\1(?![*_\w])"#)),
        (.code, try! NSRegularExpression(pattern: #"`[^`\n]+`"#)),
        (.link, try! NSRegularExpression(pattern: #"\[[^\]\n]+\]\([^)\s]+\)"#)),
        (.hashtag, try! NSRegularExpression(pattern: #"(?<![\w#&/])#[\p{L}\p{N}_]+"#)),
    ]
    // swiftlint:enable force_try
}
