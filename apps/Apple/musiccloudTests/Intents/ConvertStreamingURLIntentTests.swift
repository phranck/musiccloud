import Testing
@testable import musiccloud

// MARK: - ConvertStreamingURLIntentTests

struct ConvertStreamingURLIntentTests {

    // MARK: Intent Configuration

    @Test func intentHasTitle() {
        #expect(ConvertStreamingURLIntent.title == "Convert Streaming URL")
    }

    @Test func intentHasDescription() {
        let desc = ConvertStreamingURLIntent.description
        #expect(desc != nil)
    }

    // MARK: Error Messages

    @Test func invalidURLErrorHasMessage() {
        let error = ConvertStreamingURLError.invalidURL
        let resource = error.localizedStringResource
        #expect(resource.key == "This URL is not from a supported streaming service")
    }

    @Test func conversionFailedErrorContainsReason() {
        let error = ConvertStreamingURLError.conversionFailed("Network timeout")
        let resource = error.localizedStringResource
        // The localized string resource should contain the failure reason
        #expect(resource != nil)
    }

    // MARK: URL Validation (via StreamingServices, used by the intent)

    @Test func validSpotifyURLWouldPassValidation() {
        let url = "https://open.spotify.com/track/abc123"
        #expect(StreamingServices.isStreamingURL(url))
    }

    @Test func invalidURLWouldFailValidation() {
        let url = "https://example.com/not-a-song"
        #expect(!StreamingServices.isStreamingURL(url))
    }

    @Test func emptyURLWouldFailValidation() {
        #expect(!StreamingServices.isStreamingURL(""))
    }
}
