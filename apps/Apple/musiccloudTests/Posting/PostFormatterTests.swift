import Foundation
import Testing
@testable import musiccloud

// MARK: - PostFormatterTests

struct PostFormatterTests {
    @Test func mastodonPlainTextDropsMarkdownCharacters() {
        let markdown = "# Now playing\n**MoonDial** by *Pat Metheny* in `ECM`\n[Listen](https://musiccloud.io/x) #jazz"
        #expect(PostFormatter.mastodonPlainText(fromMarkdown: markdown)
            == "Now playing\nMoonDial by Pat Metheny in ECM\nListen https://musiccloud.io/x #jazz")
    }

    /// A link whose text is its URL keeps the URL once.
    @Test func linkNamedByItsURLIsNotRepeated() {
        #expect(PostFormatter.mastodonPlainText(fromMarkdown: "[https://a.example](https://a.example)") == "https://a.example")
    }

    @Test func wordsWithUnderscoresStayAsTheyAre() {
        #expect(PostFormatter.mastodonPlainText(fromMarkdown: "song_name and snake_case") == "song_name and snake_case")
    }

    /// Mastodon counts every URL as 23 characters, however long it is.
    @Test func mastodonCountsURLsAs23Characters() {
        let url = "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt"
        #expect(PostFormatter.mastodonLength(of: "Hi \(url)") == 3 + 23)
    }

    @Test func blueskyLinkKeepsItsTextAndOpensItsURL() throws {
        let post = PostFormatter.bluesky(fromMarkdown: "**Ä** [Listen](https://musiccloud.io/x) #jazz")
        #expect(post.text == "Ä Listen #jazz")
        // "Ä " takes three bytes in UTF-8, so the link starts at byte 3.
        #expect(post.facets == [
            BlueskyFacet(byteStart: 3, byteEnd: 9, feature: .link("https://musiccloud.io/x")),
            BlueskyFacet(byteStart: 10, byteEnd: 15, feature: .tag("jazz")),
        ])
    }

    @Test func blueskyBareURLBecomesALinkWithoutTrailingPunctuation() {
        let post = PostFormatter.bluesky(fromMarkdown: "See https://musiccloud.io/x.")
        #expect(post.facets == [BlueskyFacet(byteStart: 4, byteEnd: 27, feature: .link("https://musiccloud.io/x"))])
    }

    @Test func blueskyCountsGraphemes() {
        #expect(PostFormatter.bluesky(fromMarkdown: "👩‍👩‍👧 ok").graphemeCount == 4)
    }

    @Test func facetEncodesAsTheLexiconWantsIt() throws {
        let data = try JSONEncoder().encode(BlueskyFacet(byteStart: 0, byteEnd: 4, feature: .tag("jazz")))
        let json = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let index = try #require(json["index"] as? [String: Int])
        #expect(index == ["byteStart": 0, "byteEnd": 4])
        let feature = try #require((json["features"] as? [[String: String]])?.first)
        #expect(feature == ["$type": "app.bsky.richtext.facet#tag", "tag": "jazz"])
    }
}

// MARK: - PostRequestTests

struct PostRequestTests {
    @Test func mastodonSendsContentTypeOnlyWhereTheServerRendersMarkdown() throws {
        let instance = URL(string: "https://oldbytes.space")!
        let markdown = MastodonAPI.postStatusRequest(instance: instance, token: "t", text: "**x**", markdown: true, idempotencyKey: "k")
        let plain = MastodonAPI.postStatusRequest(instance: instance, token: "t", text: "x", markdown: false, idempotencyKey: "k")
        #expect(markdown.url?.path == "/api/v1/statuses")
        #expect(markdown.value(forHTTPHeaderField: "Idempotency-Key") == "k")
        let markdownBody = try #require(markdown.httpBody)
        let plainBody = try #require(plain.httpBody)
        #expect(try JSONDecoder().decode([String: String].self, from: markdownBody) == ["status": "**x**", "content_type": "text/markdown"])
        #expect(try JSONDecoder().decode([String: String].self, from: plainBody) == ["status": "x"])
    }

    @Test func markdownSupportIsReadFromSupportedMimeTypes() throws {
        let glitch = #"{"configuration":{"statuses":{"max_characters":5000,"supported_mime_types":["text/plain","text/markdown"]}}}"#
        let upstream = #"{"configuration":{"statuses":{"max_characters":500}}}"#
        #expect(try MastodonAPI.decoder.decode(MastodonInstanceDescription.self, from: Data(glitch.utf8)).supportsMarkdown)
        #expect(try !MastodonAPI.decoder.decode(MastodonInstanceDescription.self, from: Data(upstream.utf8)).supportsMarkdown)
    }

    /// Accounts stored before the flag existed still load.
    @Test func storedAccountWithoutMarkdownFlagDecodes() throws {
        let json = #"{"instance":"https://oldbytes.space","accountID":"1","username":"u","displayName":"","characterLimit":500}"#
        #expect(try !JSONDecoder().decode(MastodonAccount.self, from: Data(json.utf8)).supportsMarkdown)
    }

    @Test func blueskyPostIsAFeedPostRecordInTheAccountsRepository() throws {
        let request = BlueskyAPI.createPostRequest(pds: URL(string: "https://pds.example")!, did: "did:plc:abc",
                                                   post: BlueskyPostText(text: "hi", facets: []),
                                                   createdAt: Date(timeIntervalSince1970: 0))
        #expect(request.url?.path == "/xrpc/com.atproto.repo.createRecord")
        let data = try #require(request.httpBody)
        let body = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(body["repo"] as? String == "did:plc:abc")
        #expect(body["collection"] as? String == "app.bsky.feed.post")
        let record = try #require(body["record"] as? [String: Any])
        #expect(record["$type"] as? String == "app.bsky.feed.post")
        #expect(record["text"] as? String == "hi")
        #expect(record["facets"] == nil)
        // The lexicon's datetime is RFC 3339 and needs a time zone; without one the PDS answers 400.
        let createdAt = try #require(record["createdAt"] as? String)
        #expect(createdAt == "1970-01-01T00:00:00.000Z")
    }
}

// MARK: - PostComposerModelTests

@MainActor
struct PostComposerModelTests {
    private let context = PostContext(
        track: TrackInfo(title: "MoonDial", artists: ["Pat Metheny"], albumName: "MoonDial", durationMs: 383_000, releaseDate: "2024-07-26"),
        album: nil, artist: nil, shareURL: "https://musiccloud.io/x", originalURL: "", serviceLinks: [])

    /// "MoonDial" plus a URL counted as 23 is 32, so the template fits in 40.
    private let mastodon = SocialAccount.mastodon(MastodonAccount(
        instance: URL(string: "https://oldbytes.space")!, accountID: "1", username: "u", displayName: "", avatarURL: nil, characterLimit: 40))
    private let bluesky = SocialAccount.bluesky(BlueskyAccount(
        did: "did:plc:abc", handle: "u.bsky.social", displayName: "", avatarURL: nil, pds: URL(string: "https://pds.example")!))

    private func model() -> PostComposerModel {
        PostComposerModel(context: context,
                          templates: [PostTemplate(name: "A", body: "**{song_name}** {share_url}"), PostTemplate(name: "B", body: "{artist}")],
                          accounts: [mastodon, bluesky])
    }

    @Test func everyAccountStartsWithTheFirstTemplate() {
        let model = model()
        #expect(model.drafts[mastodon.id] == "**MoonDial** https://musiccloud.io/x")
        #expect(model.drafts[bluesky.id] == "**MoonDial** https://musiccloud.io/x")
        #expect(model.title == "MoonDial")
        model.templateID = model.templates[1].id
        #expect(model.drafts[mastodon.id] == "Pat Metheny")
    }

    @Test func textOverTheLimitBlocksPosting() {
        let model = model()
        #expect(model.canPost)
        model.drafts[mastodon.id] = String(repeating: "x", count: 41)
        #expect(model.isOutOfBounds(mastodon))
        #expect(!model.canPost)
        model.selectedAccountIDs.remove(mastodon.id)
        #expect(model.canPost)
    }

    @Test func aFailedAccountIsRetriedAloneNextTime() async {
        let model = model()
        var sent: [String] = []
        await model.post { account, _ in
            sent.append(account.id)
            if account == self.bluesky { throw SocialServiceError.refused(status: 500) }
        }
        #expect(model.states[mastodon.id] == .posted)
        #expect(model.states[bluesky.id] == .failed(SocialServiceError.refused(status: 500).localizedDescription))
        #expect(!model.isDone)

        sent = []
        await model.post { account, _ in sent.append(account.id) }
        #expect(sent == [bluesky.id])
        #expect(model.isDone)
    }
}
