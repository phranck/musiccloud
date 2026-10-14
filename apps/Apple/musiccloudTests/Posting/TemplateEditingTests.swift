import Foundation
import Testing
@testable import musiccloud

// MARK: - TemplateSyntaxHighlighterTests

struct TemplateSyntaxHighlighterTests {
    private func kinds(_ text: String) -> [String: TemplateSyntaxHighlighter.Kind] {
        var result: [String: TemplateSyntaxHighlighter.Kind] = [:]
        for highlight in TemplateSyntaxHighlighter.highlights(in: text, isVariable: { PostVariable(rawValue: $0) != nil }) {
            result[(text as NSString).substring(with: highlight.range)] = highlight.kind
        }
        return result
    }

    @Test func variablesAreKnownOrUnknown() {
        let found = kinds("{song_name} and {nonsense}")
        #expect(found["{song_name}"] == .variable)
        #expect(found["{nonsense}"] == .unknownVariable)
    }

    @Test func markdownIsRecognized() {
        let found = kinds("# Title\n**bold** and *italic* and `code` and [a](https://x.io)")
        #expect(found["# Title"] == .heading)
        #expect(found["**bold**"] == .bold)
        #expect(found["*italic*"] == .italic)
        #expect(found["`code`"] == .code)
        #expect(found["[a](https://x.io)"] == .link)
    }

    /// A hashtag is no heading, and a heading is no hashtag.
    @Test func hashtagsAreNotHeadings() {
        let found = kinds("#nowplaying\n# Heading")
        #expect(found["#nowplaying"] == .hashtag)
        #expect(found["# Heading"] == .heading)
        #expect(found["#"] == nil)
    }

    /// A word joined by underscores inside a placeholder is no italic text.
    @Test func placeholderUnderscoresAreNoItalic() {
        let found = kinds("{song_name}_{album_name}")
        #expect(found.values.contains(.italic) == false)
    }
}

// MARK: - TemplateCompletionTests

struct TemplateCompletionTests {
    @Test func braceStartsACompletion() {
        let text = "Now playing: {"
        #expect(TemplateCompletion.partialRange(in: text, cursor: (text as NSString).length) == NSRange(location: 13, length: 1))
    }

    @Test func typedCharactersExtendTheRange() {
        let text = "x {son"
        #expect(TemplateCompletion.partialRange(in: text, cursor: 6) == NSRange(location: 2, length: 4))
    }

    /// A closing brace after the cursor is replaced too, so accepting does not double it.
    @Test func closingBraceAfterTheCursorBelongsToTheRange() {
        let text = "{so}"
        #expect(TemplateCompletion.partialRange(in: text, cursor: 3) == NSRange(location: 0, length: 4))
    }

    @Test func noCompletionOutsideAPlaceholder() {
        #expect(TemplateCompletion.partialRange(in: "plain text", cursor: 5) == nil)
        #expect(TemplateCompletion.partialRange(in: "{song name", cursor: 10) == nil)
    }

    @Test func candidatesFilterByWhatWasTyped() {
        let tokens = TemplateCompletion.tokens(serviceLinks: [ServiceLink(service: "spotify", displayName: "Spotify", url: "")])
        #expect(TemplateCompletion.candidates(for: "{so", from: tokens) == ["{song_name}"])
        #expect(TemplateCompletion.candidates(for: "{sp", from: tokens) == ["{spotify_url}"])
        #expect(TemplateCompletion.candidates(for: "{", from: tokens).count == PostVariable.allCases.count + 1)
    }
}
