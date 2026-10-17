//
//  OpenGraph.swift
//  musiccloud
//

import Foundation

// MARK: - OpenGraph

/// The Open Graph tags of a web page that a link preview is made from.
///
/// Mastodon reads these itself when a post contains a link. Bluesky does not,
/// so the Bluesky connector reads them and sends the card with the post.
struct OpenGraph: Equatable, Sendable {
    var title: String?
    var description: String?
    var image: URL?

    /// The tags found in `html`, with relative image URLs resolved against `page`.
    ///
    /// Only `<meta>` tags are read, in either attribute order, with `property`
    /// or `name`. Entities that pages commonly use in these values are decoded.
    init(html: String, page: URL) {
        var values: [String: String] = [:]
        let whole = NSRange(html.startIndex..., in: html)
        for match in Self.metaTag.matches(in: html, range: whole) {
            let tag = (html as NSString).substring(with: match.range)
            guard let key = Self.attribute("property", in: tag) ?? Self.attribute("name", in: tag),
                let content = Self.attribute("content", in: tag), values[key.lowercased()] == nil
            else { continue }
            values[key.lowercased()] = Self.decodingEntities(content)
        }
        title = values["og:title"]
        description = values["og:description"]
        image = values["og:image"].flatMap { URL(string: $0, relativeTo: page)?.absoluteURL }
    }
}

private extension OpenGraph {
    // The patterns are fixed and valid, so building them cannot fail.
    // swiftlint:disable force_try
    static let metaTag = try! NSRegularExpression(pattern: #"<meta\b[^>]*>"#, options: .caseInsensitive)
    // swiftlint:enable force_try

    /// The value of `name="…"` or `name='…'` in `tag`.
    static func attribute(_ name: String, in tag: String) -> String? {
        let pattern = #"\b"# + name + #"\s*=\s*("([^"]*)"|'([^']*)')"#
        guard let expression = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
            let match = expression.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag))
        else { return nil }
        let source = tag as NSString
        let group = match.range(at: 2).location != NSNotFound ? 2 : 3
        return source.substring(with: match.range(at: group))
    }

    static func decodingEntities(_ text: String) -> String {
        [("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'"), ("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&")].reduce(text) {
            $0.replacingOccurrences(of: $1.0, with: $1.1)
        }
    }
}
