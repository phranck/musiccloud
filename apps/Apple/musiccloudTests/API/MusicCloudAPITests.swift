import Foundation
import Testing
@testable import musiccloud

// MARK: - MusicCloudAPITests

struct MusicCloudAPITests {

    // MARK: Base URL

    @Test func baseURLIsValid() {
        let url = MusicCloudAPI.baseURL
        #expect(url.scheme == "http" || url.scheme == "https")
        #expect(url.host != nil)
    }

    /// The Debug fallback has to reach the local frontend, whose port
    /// `grat.config` at the repository root decides.
    @Test func debugBaseURLIsLocalFrontend() throws {
        #if DEBUG
        guard ProcessInfo.processInfo.environment["MUSICCLOUD_BASE_URL"] == nil else { return }
        #expect(MusicCloudAPI.baseURL.host == "localhost")
        #expect(MusicCloudAPI.baseURL.port == (try Self.gratFrontendPort()))
        #endif
    }

    /// Reads the `port` of the `frontend` service from `grat.config`.
    private static func gratFrontendPort() throws -> Int {
        let repositoryRoot = URL(filePath: #filePath)
            .deletingLastPathComponent() // API
            .deletingLastPathComponent() // musiccloudTests
            .deletingLastPathComponent() // Apple
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent()
        let config = try String(contentsOf: repositoryRoot.appending(path: "grat.config"), encoding: .utf8)
        let services = config.components(separatedBy: "[[services]]")
        let frontend = try #require(services.first { $0.contains("name = 'frontend'") })
        let portLine = try #require(frontend.split(separator: "\n").first { $0.hasPrefix("port = ") })
        return try #require(Int(portLine.dropFirst("port = ".count)))
    }

    // MARK: Resolve endpoint construction

    @Test func resolveEndpointPath() {
        let endpoint = MusicCloudAPI.baseURL.appendingPathComponent("api/resolve")
        #expect(endpoint.path.contains("api/resolve"))
    }

    // MARK: Request body encoding

    @Test func resolveRequestBodyEncoding() throws {
        let query = "https://open.spotify.com/track/abc"
        let body = try JSONEncoder().encode(["query": query])
        let decoded = try JSONDecoder().decode([String: String].self, from: body)
        #expect(decoded["query"] == query)
    }

    // MARK: Short link origin

    private func response(shortUrl: String) throws -> ResolveResponse {
        let json = #"{"shortUrl": "\#(shortUrl)", "links": []}"#
        return try JSONDecoder().decode(ResolveResponse.self, from: Data(json.utf8))
    }

    @Test func productionShortLinkMovesOntoRequestHost() throws {
        let base = try #require(URL(string: "http://localhost:3000"))
        let moved = try response(shortUrl: "https://musiccloud.io/abc?x=1").pointing(at: base)
        #expect(moved.shortUrl == "http://localhost:3000/abc?x=1")
    }

    @Test func productionShortLinkStaysOnProduction() throws {
        let base = try #require(URL(string: "https://musiccloud.io"))
        let moved = try response(shortUrl: "https://musiccloud.io/abc").pointing(at: base)
        #expect(moved.shortUrl == "https://musiccloud.io/abc")
    }

    @Test(arguments: [
        "https://musiccloud.io.evil.com/abc",
        "https://evil.com/abc",
        "http://musiccloud.io/abc",
        "file:///etc/passwd",
        "tel:+431234567",
        "musiccloud.io/abc",
    ])
    func shortLinkOutsideMusicCloudIsRefused(_ shortUrl: String) throws {
        let base = try #require(URL(string: "https://musiccloud.io"))
        #expect(throws: ResolveError.self) {
            try response(shortUrl: shortUrl).pointing(at: base)
        }
    }
}
