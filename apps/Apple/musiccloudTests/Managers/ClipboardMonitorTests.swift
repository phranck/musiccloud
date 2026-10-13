import Foundation
import SwiftData
import Testing
@testable import musiccloud
#if os(macOS)
import AppKit
#endif

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
        let status = ClipboardMonitor.Status.success(shortUrl: "https://musiccloud.io/abc", mediaType: .track)
        #expect(!status.isProcessing)
        #expect(status.errorMessage == nil)
    }

    @Test func statusErrorHasMessage() {
        let status = ClipboardMonitor.Status.error(.unknown("Network timeout"))
        #expect(!status.isProcessing)
        #expect(status.errorMessage == "Network timeout")
    }

    // MARK: Status Equatable

    @Test func statusEquatable() {
        #expect(ClipboardMonitor.Status.idle == .idle)
        #expect(ClipboardMonitor.Status.processing(url: "a") == .processing(url: "a"))
        #expect(ClipboardMonitor.Status.processing(url: "a") != .processing(url: "b"))
        #expect(ClipboardMonitor.Status.success(shortUrl: "x", mediaType: .track) == .success(shortUrl: "x", mediaType: .track))
        #expect(ClipboardMonitor.Status.error(.unknown("e")) == .error(.unknown("e")))
        #expect(ClipboardMonitor.Status.idle != .error(.unknown("e")))
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
        let success = ClipboardMonitor.Status.success(shortUrl: "https://musiccloud.io/abc", mediaType: .track)
        #expect(processing != success)
        #expect(processing.isProcessing)
        #expect(!success.isProcessing)
        #expect(success.errorMessage == nil)
    }

    @Test func statusTransitionProcessingToError() {
        let processing = ClipboardMonitor.Status.processing(url: "https://open.spotify.com/track/abc")
        let error = ClipboardMonitor.Status.error(.unknown("Service unavailable"))
        #expect(processing != error)
        #expect(processing.isProcessing)
        #expect(!error.isProcessing)
        #expect(error.errorMessage == "Service unavailable")
    }

    @Test func statusSuccessPreservesShortUrl() {
        let success = ClipboardMonitor.Status.success(shortUrl: "https://musiccloud.io/xyz789", mediaType: .track)
        #expect(success == .success(shortUrl: "https://musiccloud.io/xyz789", mediaType: .track))
        #expect(success != .success(shortUrl: "https://musiccloud.io/other", mediaType: .track))
        #expect(success != .success(shortUrl: "https://musiccloud.io/xyz789", mediaType: .album))
    }

    @Test func statusErrorPreservesMessage() {
        let error = ClipboardMonitor.Status.error(.unknown("Rate limited"))
        #expect(error.errorMessage == "Rate limited")
        let different = ClipboardMonitor.Status.error(.unknown("Timeout"))
        #expect(error != different)
    }

    // MARK: Private Content

    #if os(macOS)
    @MainActor
    @Test func passwordManagerContentIsSkipped() {
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("io.musiccloud.tests.\(UUID().uuidString)"))
        defer { pasteboard.releaseGlobally() }

        pasteboard.declareTypes([.string, NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType")], owner: nil)
        pasteboard.setString("https://open.spotify.com/track/abc", forType: .string)
        #expect(ClipboardMonitor.holdsConcealedContent(pasteboard))

        pasteboard.clearContents()
        pasteboard.setString("https://open.spotify.com/track/abc", forType: .string)
        #expect(!ClipboardMonitor.holdsConcealedContent(pasteboard))
    }
    #endif

    // MARK: Error mapping

    @Test func transportFailureBecomesNetworkError() {
        #expect(ResolveError(URLError(.notConnectedToInternet)) == .networkError)
    }

    @Test func resolveErrorPassesThrough() {
        #expect(ResolveError(ResolveError.rateLimited) == .rateLimited)
    }

    @Test func statusKeepsTheRateLimitCase() {
        let status = ClipboardMonitor.Status.error(.rateLimited)
        #expect(status == .error(.rateLimited))
        #expect(status.errorMessage == ResolveError.rateLimited.errorDescription)
    }

    // MARK: Cancellation

    @Test func cancellationIsRecognizedFromBothSources() {
        #expect(ClipboardMonitor.isCancellation(CancellationError()))
        #expect(ClipboardMonitor.isCancellation(URLError(.cancelled)))
        #expect(!ClipboardMonitor.isCancellation(URLError(.timedOut)))
        #expect(!ClipboardMonitor.isCancellation(ResolveError.rateLimited))
    }

    // MARK: Single conversion

    @MainActor
    @Test func secondConversionWaitsForTheFirst() throws {
        let container = try SharedStoreConfiguration.makeContainer()
        let monitor = ClipboardMonitor(historyManager: HistoryManager(modelContext: container.mainContext))
        monitor.status = .processing(url: "https://open.spotify.com/track/first")

        monitor.convert(url: "https://open.spotify.com/track/second")

        #expect(monitor.status == .processing(url: "https://open.spotify.com/track/first"))
    }
}

