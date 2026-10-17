import Foundation
import SwiftData
import Testing
@testable import musiccloud
#if os(macOS)
import AppKit
#else
import AVFoundation
import SwiftUI
import UIKit
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

    @MainActor
    @Test func refusedConversionNeitherStartsNorTakesOverTheOrigin() throws {
        let container = try SharedStoreConfiguration.makeContainer()
        let monitor = ClipboardMonitor(historyManager: HistoryManager(modelContext: container.mainContext))
        monitor.status = .processing(url: "https://open.spotify.com/track/first")

        monitor.convert(url: "https://open.spotify.com/track/second", origin: .clipboard)

        // The iOS conversion sheet opens on a new count from the clipboard,
        // so a refused URL must leave both alone.
        #expect(monitor.conversionCount == 0)
        #expect(monitor.origin == .request)
    }
}

#if os(iOS)
/// Exercises clipboard-sheet presentation and audio responsiveness on iOS.
/// The store and clipboard sink are isolated from the user's data.
@Suite(.serialized)
@MainActor
struct ClipboardConversionSheetTests {
    /// Exercises the real audio factory so a main-actor dispatch cannot reintroduce the freeze.
    @Test func audioPlayerIsCreatedOffTheMainThread() async throws {
        let url = try #require(Bundle.main.url(forResource: NotificationSound.default.rawValue, withExtension: "mp3"))
        await confirmation("Audio factory executes once") { created in
            let playback = NotificationSoundPlayback(makePlayer: { url in
                #expect(!Thread.isMainThread)
                created()
                return try AVAudioPlayer(contentsOf: url)
            })
            await playback.play(url: url)
        }
    }

    /// Audio hardware startup must not hold the main actor while a conversion animates.
    @Test func soundStartupDoesNotBlockAnimation() async throws {
        let url = try #require(Bundle.main.url(forResource: NotificationSound.default.rawValue, withExtension: "mp3"))
        var heartbeatStarted = false
        let heartbeat = Task { @MainActor in
            heartbeatStarted = true
            var maximumGap: TimeInterval = 0
            while !Task.isCancelled {
                let started = Date()
                try? await Task.sleep(for: .milliseconds(10))
                maximumGap = max(maximumGap, Date().timeIntervalSince(started))
            }
            return maximumGap
        }
        defer { heartbeat.cancel() }
        while !heartbeatStarted { await Task.yield() }
        await NotificationSoundPlayback.shared.play(url: url)
        heartbeat.cancel()
        let maximumGap = await heartbeat.value
        // A 100 ms stall skips three frames of the 30 FPS conversion animation.
        let maximumAllowedGap: TimeInterval = 0.1
        #expect(maximumGap < maximumAllowedGap, "Sound startup must not freeze the animation for 100 ms")
    }

    /// A cached answer finishes synchronously, including when monitoring starts
    /// before the root view mounts. Both timings must present the result sheet.
    @Test(arguments: [true, false])
    func cachedClipboardConversionKeepsItsSheet(startBeforeMount: Bool) async throws {
        let container = try SharedStoreConfiguration.makeContainer()
        let history = HistoryManager(modelContext: container.mainContext)
        let entry = MediaEntry(
            originalUrl: "https://open.spotify.com/track/clipboard-sheet-test",
            shortUrl: "https://musiccloud.io/clipboard-sheet-test",
            mediaType: .track,
            track: TrackInfo(title: "Clipboard sheet test", artists: ["Test artist"])
        )
        history.add(entry)
        let monitor = ClipboardMonitor(historyManager: history, copyToPasteboard: { _ in })
        if startBeforeMount {
            monitor.convert(url: entry.originalUrl, origin: .clipboard)
        }

        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        var didAppear = false
        let host = UIHostingController(rootView:
            Text("Clipboard sheet host")
                .clipboardConversionSheet(monitor: monitor, historyManager: history)
                .modelContainer(container)
                .onAppear { didAppear = true }
        )
        window.rootViewController = host
        window.isHidden = false
        defer {
            host.dismiss(animated: false)
            window.isHidden = true
            window.rootViewController = nil
        }
        host.view.layoutIfNeeded()
        for _ in 0..<100 {
            if didAppear { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(didAppear, "The host must mount before a later conversion starts")
        if !startBeforeMount {
            monitor.convert(url: entry.originalUrl, origin: .clipboard)
        }

        for _ in 0..<100 {
            if host.presentedViewController != nil { break }
            try await Task.sleep(for: .milliseconds(20))
        }
        #expect(monitor.status == .success(shortUrl: entry.shortUrl, mediaType: .track))
        #expect(host.presentedViewController != nil, "The clipboard result must remain in a presented sheet")
    }
}
#endif

/// Polls real, isolated native pasteboards through the production monitor.
/// Cached fixtures prevent network, notifications, and writes to the general clipboard.
@Suite(.serialized)
@MainActor
struct ClipboardOriginTests {
    private static let sourceURL = "https://open.spotify.com/track/clipboard-origin-fixture"
    private static let shortURL = "https://musiccloud.io/clipboard-origin-fixture"

    /// Local copies still convert; the observed Universal Clipboard marker suppresses automatic conversion.
    @Test(arguments: [false, true])
    func automaticConversionUsesOnlyLocalCopies(remote: Bool) async throws {
        let fixture = try cachedFixture(remote: remote)
        defer { release(fixture.pasteboard, retaining: fixture.container) }
        await fixture.monitor.checkClipboard()
        #expect(fixture.monitor.conversionCount == (remote ? 0 : 1))
        if remote {
            #expect(fixture.monitor.status == .idle)
            #expect(Pasteboard.string(from: fixture.pasteboard) == Self.sourceURL)
        } else {
            #expect(fixture.monitor.status == .success(shortUrl: Self.shortURL, mediaType: .track))
        }
    }

    /// A disabled link must be eligible again when the service is enabled and the user copies it anew.
    @Test func serviceDetectionReturnsAfterReenable() async throws {
        let suite = "ClipboardServiceTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let spotify = try #require(StreamingServices.all.first { $0.id == "spotify" })
        let fixture = try cachedFixture(remote: false, defaults: defaults)
        defer { release(fixture.pasteboard, retaining: fixture.container) }
        StreamingServices.setEnabled(false, for: spotify, defaults: defaults)
        await fixture.monitor.checkClipboard()
        #expect(fixture.monitor.conversionCount == 0)
        StreamingServices.setEnabled(true, for: spotify, defaults: defaults)
        Pasteboard.copy(Self.sourceURL, to: fixture.pasteboard)
        await fixture.monitor.checkClipboard()
        #expect(fixture.monitor.conversionCount == 1)
        #expect(fixture.monitor.status == .success(shortUrl: Self.shortURL, mediaType: .track))
    }

    /// A direct user request remains independent of automatic clipboard-origin policy.
    @Test func explicitConversionRemainsAvailable() throws {
        let fixture = try cachedFixture(remote: true)
        defer { release(fixture.pasteboard, retaining: fixture.container) }
        fixture.monitor.convert(url: Self.sourceURL)
        #expect(fixture.monitor.conversionCount == 1)
        #expect(fixture.monitor.origin == .request)
        #expect(Pasteboard.string(from: fixture.pasteboard) == Self.shortURL)
    }

    /// A history entry arriving while the request is pending must not be inserted or announced again.
    @Test func historyArrivalDuringResolveReusesTheExistingEntry() async throws {
        let container = try SharedStoreConfiguration.makeContainer()
        let history = HistoryManager(modelContext: container.mainContext)
        let pasteboard = makePasteboard(remote: false)
        defer { release(pasteboard, retaining: container) }
        let response = try JSONDecoder().decode(ResolveResponse.self, from: Data(
            #"{"shortUrl":"https://musiccloud.io/clipboard-origin-fixture","links":[]}"#.utf8
        ))
        let arrivingID = UUID()
        var notificationCount = 0
        var newEntryCount = 0
        let monitor = ClipboardMonitor(
            historyManager: history,
            pasteboard: pasteboard,
            resolveURL: { _ in
                await MainActor.run {
                    history.add(MediaEntry(
                        id: arrivingID,
                        originalUrl: "https://music.apple.com/album/arrival-fixture/1",
                        shortUrl: response.shortUrl,
                        mediaType: .track
                    ))
                }
                return Conversion(response: response, artworkData: nil)
            },
            notifySuccess: { _ in notificationCount += 1 }
        )
        monitor.onNewEntry = { _ in newEntryCount += 1 }
        monitor.convert(url: Self.sourceURL)
        let deadline = ContinuousClock.now.advanced(by: .seconds(2))
        while monitor.status.isProcessing, ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(10))
        }
        let entries = try container.mainContext.fetch(FetchDescriptor<MediaEntry>())
        #expect(monitor.status == .success(shortUrl: Self.shortURL, mediaType: .track))
        #expect(entries.count == 1)
        #expect(entries.first?.id == arrivingID)
        #expect(notificationCount == 0)
        #expect(newEntryCount == 0)
        #expect(Pasteboard.string(from: pasteboard) == Self.shortURL)
    }

}

private extension ClipboardOriginTests {
    /// Builds an in-memory history hit so polling cannot contact the production backend.
    func cachedFixture(remote: Bool, defaults: UserDefaults = DefaultsKey.shared) throws -> (container: ModelContainer, pasteboard: SystemPasteboard, monitor: ClipboardMonitor) {
        let container = try SharedStoreConfiguration.makeContainer()
        let history = HistoryManager(modelContext: container.mainContext)
        history.add(MediaEntry(originalUrl: Self.sourceURL, shortUrl: Self.shortURL, mediaType: .track))
        let pasteboard = makePasteboard(remote: remote)
        let monitor = ClipboardMonitor(historyManager: history, pasteboard: pasteboard, streamingDefaults: defaults, notifySuccess: { _ in
            Issue.record("A cached conversion must not send a notification")
        })
        return (container, pasteboard, monitor)
    }

    /// Creates only a named fixture board, including the independently observed remote marker when requested.
    func makePasteboard(remote: Bool) -> SystemPasteboard {
        #if os(macOS)
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("io.musiccloud.origin-tests.\(UUID().uuidString)"))
        var types: [NSPasteboard.PasteboardType] = [.string]
        if remote { types.append(NSPasteboard.PasteboardType("com.apple.is-remote-clipboard")) }
        pasteboard.declareTypes(types, owner: nil)
        pasteboard.setString(Self.sourceURL, forType: .string)
        #else
        let pasteboard = UIPasteboard.withUniqueName()
        var item: [String: Any] = ["public.utf8-plain-text": Self.sourceURL]
        if remote { item["com.apple.is-remote-clipboard"] = Data([1]) }
        pasteboard.items = [item]
        #endif
        return pasteboard
    }

    /// Releases the unique fixture board while retaining its in-memory store through cleanup.
    /// - Parameters:
    ///   - pasteboard: Only the named board created by this suite.
    ///   - container: The store that must remain alive until all assertions and cleanup finish.
    func release(_ pasteboard: SystemPasteboard, retaining container: ModelContainer) {
        withExtendedLifetime(container) {
            #if os(macOS)
            pasteboard.releaseGlobally()
            #else
            UIPasteboard.remove(withName: pasteboard.name)
            #endif
        }
    }
}

