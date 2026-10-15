import Foundation
import Testing
@testable import musiccloud

// MARK: - LinkCardTests

struct LinkCardTests {
    private let page = URL(string: "https://musiccloud.io/3CCvY3vW")!

    @Test func openGraphTagsAreReadInEitherAttributeOrder() {
        let html = """
        <head>
        <meta property="og:title" content="MoonDial - Pat Metheny">
        <meta content='Listen on Spotify &amp; more' property='og:description'>
        <meta property="og:image" content="https://i.scdn.co/image/abc">
        <meta property="og:image:width" content="1200">
        </head>
        """
        let graph = OpenGraph(html: html, page: page)
        #expect(graph.title == "MoonDial - Pat Metheny")
        #expect(graph.description == "Listen on Spotify & more")
        #expect(graph.image == URL(string: "https://i.scdn.co/image/abc"))
    }

    @Test func relativeImageIsResolvedAgainstThePage() {
        let graph = OpenGraph(html: #"<meta name="og:image" content="/og/3CCvY3vW.png">"#, page: page)
        #expect(graph.image?.absoluteString == "https://musiccloud.io/og/3CCvY3vW.png")
    }

    @Test func pageWithoutTagsGivesNothing() {
        let graph = OpenGraph(html: "<html><title>x</title></html>", page: page)
        #expect(graph == OpenGraph(html: "", page: page))
        #expect(graph.title == nil && graph.image == nil)
    }

    /// The blob goes back as the PDS returned it, with its size as an integer.
    @Test func postCarriesTheCardWithItsBlobUnchanged() throws {
        let blobJSON = #"{"blob":{"$type":"blob","ref":{"$link":"bafkrei123"},"mimeType":"image/jpeg","size":760898}}"#
        let blob = try JSONDecoder().decode(BlueskyUploadedBlob.self, from: Data(blobJSON.utf8)).blob
        let card = BlueskyExternalEmbed(external: .init(uri: page.absoluteString, title: "MoonDial", description: "Listen", thumb: blob))
        let request = BlueskyAPI.createPostRequest(pds: URL(string: "https://pds.example")!, did: "did:plc:abc",
                                                   post: BlueskyPostText(text: "hi", facets: []), createdAt: .now, card: card)
        let body = try #require(request.httpBody)
        let json = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        let embed = try #require((json["record"] as? [String: Any])?["embed"] as? [String: Any])
        #expect(embed["$type"] as? String == "app.bsky.embed.external")
        let external = try #require(embed["external"] as? [String: Any])
        #expect(external["uri"] as? String == page.absoluteString)
        let thumb = try #require(external["thumb"] as? [String: Any])
        #expect((thumb["ref"] as? [String: String])?["$link"] == "bafkrei123")
        #expect(String(data: body, encoding: .utf8)?.contains("\"size\":760898") == true)
    }

    @Test func cardWithoutImageLeavesThumbOut() throws {
        let card = BlueskyExternalEmbed(external: .init(uri: "https://a.example", title: "A", description: "", thumb: nil))
        let data = try JSONEncoder().encode(card)
        #expect(String(data: data, encoding: .utf8)?.contains("thumb") == false)
    }

    @Test func uploadSendsTheImageWithItsType() {
        let request = BlueskyAPI.uploadBlobRequest(pds: URL(string: "https://pds.example")!, data: Data([1, 2, 3]), mimeType: "image/png")
        #expect(request.url?.path == "/xrpc/com.atproto.repo.uploadBlob")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "image/png")
        #expect(request.httpBody == Data([1, 2, 3]))
    }
}
