//
//  MarkdownSyntax.swift
//  musiccloud
//

import Foundation

// MARK: - MarkdownSyntax

/// The Markdown a post template may use, as one set of patterns.
///
/// The Template Editor colors these ranges and ``PostFormatter`` turns them
/// into plain text, so both read the same syntax from here. Each pattern
/// names in a comment which capture group holds the text a reader sees.
enum MarkdownSyntax {
    // The patterns are fixed and valid, so building them cannot fail.
    // swiftlint:disable force_try

    /// `# Heading` at the start of a line; group 1 is the heading's text.
    static let heading = try! NSRegularExpression(pattern: #"^#{1,6}[ \t]+(.*)$"#, options: .anchorsMatchLines)
    /// `> quote` at the start of a line; group 1 is the quoted text.
    static let quote = try! NSRegularExpression(pattern: #"^>[ \t]?(.*)$"#, options: .anchorsMatchLines)
    /// `**bold**` or `__bold__`; group 2 is the text.
    static let bold = try! NSRegularExpression(pattern: #"(\*\*|__)(?=\S)([^\n]+?)(?<=\S)\1"#)
    /// `*italic*` or `_italic_`, not inside a word; group 2 is the text.
    static let italic = try! NSRegularExpression(pattern: #"(?<![*_\w])([*_])(?=\S)([^*_\n]+?)(?<=\S)\1(?![*_\w])"#)
    /// `` `code` ``; group 1 is the text.
    static let code = try! NSRegularExpression(pattern: #"`([^`\n]+)`"#)
    /// `[text](url)`; group 1 is the text, group 2 the URL.
    static let link = try! NSRegularExpression(pattern: #"\[([^\]\n]+)\]\(([^)\s]+)\)"#)
    /// `#tag`, not after a word, `#`, `&` or `/`; group 1 is the tag without `#`.
    static let hashtag = try! NSRegularExpression(pattern: #"(?<![\w#&/])#([\p{L}\p{N}_]+)"#)
    /// A bare `http` or `https` URL, ending before closing punctuation.
    static let bareURL = try! NSRegularExpression(pattern: #"https?://[^\s<>"]+[^\s<>".,;:!?)\]'’]"#)
    /// A `{name}` placeholder; group 1 is the name.
    static let placeholder = try! NSRegularExpression(pattern: #"\{([a-z0-9_]+)\}"#)

    // swiftlint:enable force_try
}
