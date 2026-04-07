import Testing
@testable import musiccloud

// MARK: - ClipboardMonitorTests

struct ClipboardMonitorTests {

    // MARK: Status

    @Test func statusIdleIsNotProcessing() {
        let status = ClipboardMonitor.Status.idle
        #expect(!status.isProcessing)
        #expect(status.errorMessage == nil)
    }

    @Test func statusProcessingIsProcessing() {
        let status = ClipboardMonitor.Status.processing(url: "https://open.spotify.com/track/abc")
        #expect(status.isProcessing)
        #expect(status.errorMessage == nil)
    }

    @Test func statusSuccessIsNotProcessing() {
        let status = ClipboardMonitor.Status.success(shortUrl: "https://musiccloud.io/abc")
        #expect(!status.isProcessing)
        #expect(status.errorMessage == nil)
    }

    @Test func statusErrorHasMessage() {
        let status = ClipboardMonitor.Status.error(message: "Network timeout")
        #expect(!status.isProcessing)
        #expect(status.errorMessage == "Network timeout")
    }

    // MARK: Status Equatable

    @Test func statusEquatable() {
        #expect(ClipboardMonitor.Status.idle == .idle)
        #expect(ClipboardMonitor.Status.processing(url: "a") == .processing(url: "a"))
        #expect(ClipboardMonitor.Status.processing(url: "a") != .processing(url: "b"))
        #expect(ClipboardMonitor.Status.success(shortUrl: "x") == .success(shortUrl: "x"))
        #expect(ClipboardMonitor.Status.error(message: "e") == .error(message: "e"))
        #expect(ClipboardMonitor.Status.idle != .error(message: "e"))
    }

    // MARK: Status Transitions

    @Test func statusTransitionIdleToProcessing() {
        let idle = ClipboardMonitor.Status.idle
        let processing = ClipboardMonitor.Status.processing(url: "https://open.spotify.com/track/abc")
        #expect(idle != processing)
        #expect(!idle.isProcessing)
        #expect(processing.isProcessing)
    }

    @Test func statusTransitionProcessingToSuccess() {
        let processing = ClipboardMonitor.Status.processing(url: "https://open.spotify.com/track/abc")
        let success = ClipboardMonitor.Status.success(shortUrl: "https://musiccloud.io/abc")
        #expect(processing != success)
        #expect(processing.isProcessing)
        #expect(!success.isProcessing)
        #expect(success.errorMessage == nil)
    }

    @Test func statusTransitionProcessingToError() {
        let processing = ClipboardMonitor.Status.processing(url: "https://open.spotify.com/track/abc")
        let error = ClipboardMonitor.Status.error(message: "Service unavailable")
        #expect(processing != error)
        #expect(processing.isProcessing)
        #expect(!error.isProcessing)
        #expect(error.errorMessage == "Service unavailable")
    }

    @Test func statusSuccessPreservesShortUrl() {
        let success = ClipboardMonitor.Status.success(shortUrl: "https://musiccloud.io/xyz789")
        #expect(success == .success(shortUrl: "https://musiccloud.io/xyz789"))
        #expect(success != .success(shortUrl: "https://musiccloud.io/other"))
    }

    @Test func statusErrorPreservesMessage() {
        let error = ClipboardMonitor.Status.error(message: "Rate limited")
        #expect(error.errorMessage == "Rate limited")
        let different = ClipboardMonitor.Status.error(message: "Timeout")
        #expect(error != different)
    }
}
