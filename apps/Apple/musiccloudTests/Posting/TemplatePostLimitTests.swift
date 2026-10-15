import Foundation
import Testing
@testable import musiccloud

// MARK: - TemplatePostLimitTests

struct TemplatePostLimitTests {
    private func mastodon(limit: Int, markdown: Bool) -> MastodonAccount {
        MastodonAccount(instance: URL(string: "https://a.example")!, accountID: UUID().uuidString, username: "u", displayName: "",
                        avatarURL: nil, characterLimit: limit, supportsMarkdown: markdown)
    }

    @Test func overflowStartsAtTheFirstCharacterPastTheLimit() throws {
        let text = "abcdef"
        let start = try #require(PostFormatter.mastodonOverflowStart(in: text, limit: 4))
        #expect(text[start...] == "ef")
        #expect(PostFormatter.mastodonOverflowStart(in: text, limit: 6) == nil)
    }

    /// A URL counts as 23 characters, so a long one fits and a short limit cuts before it as a whole.
    @Test func urlCountsAsOneBlockOf23() throws {
        let url = "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt"
        #expect(PostFormatter.mastodonOverflowStart(in: "Hi \(url)", limit: 26) == nil)
        let text = "Hi \(url) end"
        let start = try #require(PostFormatter.mastodonOverflowStart(in: text, limit: 10))
        #expect(text[start...] == "\(url) end")
    }

    @Test func blueskyOverflowCountsGraphemes() throws {
        let text = "👩‍👩‍👧abc"
        let start = try #require(PostFormatter.graphemeOverflowStart(in: text, limit: 2))
        #expect(text[start...] == "bc")
    }

    @Test func limitComesFromTheIconsService() {
        #expect(TemplatePostLimit(icon: .bluesky, mastodonAccounts: [])?.limit == 300)
        #expect(TemplatePostLimit(icon: .mastodon, mastodonAccounts: [])?.limit == 500)
        #expect(TemplatePostLimit(icon: .note, mastodonAccounts: []) == nil)
        #expect(TemplatePostLimit(icon: nil, mastodonAccounts: []) == nil)
    }

    /// With several Mastodon accounts the template has to fit the smallest, and stays Markdown only if all render it.
    @Test func severalMastodonAccountsGiveTheStrictestLimit() {
        let limit = TemplatePostLimit(icon: .mastodon, mastodonAccounts: [mastodon(limit: 5000, markdown: true), mastodon(limit: 500, markdown: false)])
        #expect(limit?.limit == 500)
        #expect(limit?.service == .mastodon(markdown: false))
        let markdown = TemplatePostLimit(icon: .mastodon, mastodonAccounts: [mastodon(limit: 5000, markdown: true)])
        #expect(markdown?.service == .mastodon(markdown: true))
    }
}
