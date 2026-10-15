//
//  PostFormatter.swift
//  musiccloud
//

import Foundation

// MARK: - PostFormatter

/// Turns a rendered template, which is Markdown, into what each network accepts.
///
/// A Mastodon server that renders Markdown gets the text as it is. Every
/// other Mastodon server gets plain text without the Markdown characters, so
/// no reader sees `**` in a post; a link keeps its URL beside its text. Bluesky
/// has no Markdown either, but marks links and hashtags as facets, so a link
/// there keeps only its text and still opens its URL.
enum PostFormatter {
    /// The Markdown without its formatting characters, for a Mastodon server that does not render Markdown.
    static func mastodonPlainText(fromMarkdown markdown: String) -> String {
        removingLinks(from: removingEmphasis(from: markdown)) { label, url in
            label == url ? url : "\(label) \(url)"
        }.0
    }

    /// The text and facets of a Bluesky post written from `markdown`.
    static func bluesky(fromMarkdown markdown: String) -> BlueskyPostText {
        let (text, markdownLinks) = removingLinks(from: removingEmphasis(from: markdown)) { label, _ in label }
        var facets = markdownLinks.compactMap { range, url in BlueskyFacet(range: range, in: text, feature: .link(url)) }

        let whole = NSRange(text.startIndex..., in: text)
        for match in MarkdownSyntax.bareURL.matches(in: text, range: whole)
        where !markdownLinks.contains(where: { NSIntersectionRange($0.range, match.range).length > 0 }) {
            let url = (text as NSString).substring(with: match.range)
            if let facet = BlueskyFacet(range: match.range, in: text, feature: .link(url)) {
                facets.append(facet)
            }
        }
        for match in MarkdownSyntax.hashtag.matches(in: text, range: whole) {
            let tag = (text as NSString).substring(with: match.range(at: 1))
            if let facet = BlueskyFacet(range: match.range, in: text, feature: .tag(tag)) {
                facets.append(facet)
            }
        }
        return BlueskyPostText(text: text, facets: facets.sorted { $0.byteStart < $1.byteStart })
    }

    /// How many characters Mastodon counts a URL as, whatever its length (`characters_reserved_per_url`).
    static let mastodonCharactersPerURL = 23

    /// The length Mastodon counts: characters, with every URL counting as `urlLength`.
    static func mastodonLength(of text: String, urlLength: Int = mastodonCharactersPerURL) -> Int {
        let whole = NSRange(text.startIndex..., in: text)
        var length = text.unicodeScalars.count
        for match in MarkdownSyntax.bareURL.matches(in: text, range: whole) {
            let url = (text as NSString).substring(with: match.range)
            length += urlLength - url.unicodeScalars.count
        }
        return length
    }
}

extension PostFormatter {
    /// Where `text` passes Mastodon's `limit`, counting every URL as `urlLength`.
    ///
    /// - Returns: The index of the first character past the limit, or `nil` when the text fits.
    static func mastodonOverflowStart(in text: String, limit: Int, urlLength: Int = mastodonCharactersPerURL) -> String.Index? {
        let urls = MarkdownSyntax.bareURL.matches(in: text, range: NSRange(text.startIndex..., in: text))
            .compactMap { Range($0.range, in: text) }
        var count = 0
        var index = text.startIndex
        while index < text.endIndex {
            if let url = urls.first(where: { $0.lowerBound == index }) {
                // A URL counts as a whole; when it does not fit, the overflow starts with it.
                if count + urlLength > limit { return index }
                count += urlLength
                index = url.upperBound
                continue
            }
            let next = text.unicodeScalars.index(after: index)
            count += 1
            if count > limit { return index }
            index = next
        }
        return nil
    }

    /// Where `text` passes Bluesky's `limit` of graphemes, or `nil` when it fits.
    static func graphemeOverflowStart(in text: String, limit: Int) -> String.Index? {
        guard text.count > limit else { return nil }
        return text.index(text.startIndex, offsetBy: limit)
    }
}

private extension PostFormatter {
    /// The text of headings, bold, italic and code spans without their markers.
    static func removingEmphasis(from markdown: String) -> String {
        let steps: [(NSRegularExpression, String)] = [
            (MarkdownSyntax.heading, "$1"),
            (MarkdownSyntax.bold, "$2"),
            (MarkdownSyntax.italic, "$2"),
            (MarkdownSyntax.code, "$1"),
        ]
        return steps.reduce(markdown) { text, step in
            step.0.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: step.1)
        }
    }

    /// Replaces every `[label](url)` with what `visible` returns for it.
    ///
    /// - Returns: The new text and, for each link, the range its visible text
    ///   took there and its URL.
    static func removingLinks(from text: String, visible: (String, String) -> String) -> (String, [(range: NSRange, url: String)]) {
        let source = text as NSString
        let result = NSMutableString()
        var links: [(range: NSRange, url: String)] = []
        var position = 0
        for match in MarkdownSyntax.link.matches(in: text, range: NSRange(location: 0, length: source.length)) {
            result.append(source.substring(with: NSRange(location: position, length: match.range.location - position)))
            let label = source.substring(with: match.range(at: 1))
            let url = source.substring(with: match.range(at: 2))
            let shown = visible(label, url)
            links.append((NSRange(location: result.length, length: (shown as NSString).length), url))
            result.append(shown)
            position = NSMaxRange(match.range)
        }
        result.append(source.substring(from: position))
        return (result as String, links)
    }
}

// MARK: - Bluesky

/// A Bluesky post's text with its rich text facets.
struct BlueskyPostText: Equatable, Sendable {
    let text: String
    let facets: [BlueskyFacet]

    /// The length Bluesky limits, in graphemes.
    var graphemeCount: Int { text.count }
}

/// One `app.bsky.richtext.facet`: a byte range of the text and what it is.
///
/// The range counts UTF-8 bytes, as the lexicon requires, not characters.
struct BlueskyFacet: Equatable, Sendable, Encodable {
    enum Feature: Equatable, Sendable {
        case link(String)
        case tag(String)
    }

    let byteStart: Int
    let byteEnd: Int
    let feature: Feature

    /// The facet for `range`, a UTF-16 range of `text`, or `nil` when it lies outside it.
    init?(range: NSRange, in text: String, feature: Feature) {
        guard let bounds = Range(range, in: text) else { return nil }
        byteStart = text[..<bounds.lowerBound].utf8.count
        byteEnd = text[..<bounds.upperBound].utf8.count
        self.feature = feature
    }

    init(byteStart: Int, byteEnd: Int, feature: Feature) {
        self.byteStart = byteStart
        self.byteEnd = byteEnd
        self.feature = feature
    }

    private enum CodingKeys: String, CodingKey { case index, features }
    private enum IndexKeys: String, CodingKey { case byteStart, byteEnd }
    private enum FeatureKeys: String, CodingKey {
        case type = "$type"
        case uri, tag
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        var index = container.nestedContainer(keyedBy: IndexKeys.self, forKey: .index)
        try index.encode(byteStart, forKey: .byteStart)
        try index.encode(byteEnd, forKey: .byteEnd)
        var features = container.nestedUnkeyedContainer(forKey: .features)
        var entry = features.nestedContainer(keyedBy: FeatureKeys.self)
        switch feature {
        case .link(let uri):
            try entry.encode("app.bsky.richtext.facet#link", forKey: .type)
            try entry.encode(uri, forKey: .uri)
        case .tag(let tag):
            try entry.encode("app.bsky.richtext.facet#tag", forKey: .type)
            try entry.encode(tag, forKey: .tag)
        }
    }
}
