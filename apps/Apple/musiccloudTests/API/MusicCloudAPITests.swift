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

    @Test func debugBaseURLIsLocal() {
        #if DEBUG
        #expect(MusicCloudAPI.baseURL.host == "localhost")
        #expect(MusicCloudAPI.baseURL.port == 3000)
        #endif
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
}
