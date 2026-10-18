//
//  PostTemplateRenderer.swift
//  musiccloud
//

import Foundation

// MARK: - PostTemplateRenderer

/// Fills a template's variables from a history entry.
///
/// A variable the entry has no value for, and a name that is no variable,
/// render as nothing. A line that held a variable and is empty afterwards
/// is removed, so "Album: {album_name}" on a single track does not leave
/// an empty line behind. Lines that were empty in the template stay.
enum PostTemplateRenderer {
    /// The suffix of a placeholder for one service's link, as in `{spotify_url}`.
    static let serviceLinkSuffix = "_url"

    /// The template body with every `{variable}` replaced.
    static func render(_ body: String, with context: PostContext) -> String {
        body.split(separator: "\n", omittingEmptySubsequences: false).compactMap { renderLine(String($0), with: context) }.joined(
            separator: "\n"
        )
    }

    /// The value of one placeholder name, without braces.
    static func value(of name: String, in context: PostContext) -> String? {
        if let variable = PostVariable(rawValue: name) { return variable.value(in: context) }
        if name.hasSuffix(serviceLinkSuffix) {
            let service = String(name.dropLast(serviceLinkSuffix.count))
            return context.serviceLinks.first { $0.service == service }?.url
        }
        return nil
    }
}

private extension PostTemplateRenderer {
    /// A placeholder: braces around lowercase letters, digits and underscores.
    nonisolated(unsafe) static let placeholder = /\{([a-z0-9_]+)\}/

    /// The line with its placeholders replaced, or `nil` when it held a
    /// placeholder and nothing but whitespace is left.
    static func renderLine(_ line: String, with context: PostContext) -> String? {
        var hadPlaceholder = false
        let rendered = line.replacing(placeholder) { match in
            hadPlaceholder = true
            return value(of: String(match.1), in: context) ?? ""
        }
        if hadPlaceholder, rendered.allSatisfy(\.isWhitespace) { return nil }
        return rendered
    }
}
