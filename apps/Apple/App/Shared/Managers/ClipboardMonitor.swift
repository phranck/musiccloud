import SwiftUI
import OSLog
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - ClipboardMonitor

/// Monitors the system clipboard for streaming service URLs and automatically converts them.
///
/// `ClipboardMonitor` continuously watches the clipboard for URLs from supported streaming services
/// (Spotify, Apple Music, YouTube Music, etc.). When detected, it automatically converts the URL
/// to a universal musiccloud.io short link and updates the clipboard.
///
/// ## Features
///
/// - Automatic URL detection using ``StreamingServices``
/// - Asynchronous URL resolution via ``MusicCloudAPI``
/// - Automatic artwork downloading
/// - History tracking via ``HistoryManager``
/// - Status reporting with ``Status`` enum
///
/// ## Usage
///
/// ```swift
/// let monitor = ClipboardMonitor(historyManager: historyManager)
/// // Monitoring starts automatically
/// ```
///
/// The monitor uses the `@Observable` macro to publish status changes to SwiftUI views.
///
/// ## Topics
///
/// ### Initialization
/// - ``init(historyManager:)``
///
/// ### Current State
/// - ``status``
/// - ``lastShortUrl``
///
/// ### Status Types
/// - ``Status``
///
/// ### Methods
/// - ``resolve(url:)``
@Observable
@MainActor
final class ClipboardMonitor {
    private let historyManager: HistoryManager
    private var lastSeenContent: String?
    @ObservationIgnored
    private var timer: Timer?
    @ObservationIgnored
    private var checkTask: Task<Void, Never>?
    @ObservationIgnored
    private var resolveTask: Task<Void, Never>?
    #if os(iOS)
    @ObservationIgnored
    private var lastChangeCount: Int = -1
    #endif

    var status: Status = .idle
    private(set) var lastShortUrl: String?

    /// Creates a new clipboard monitor.
    ///
    /// Automatically starts monitoring the clipboard and restores the last short URL
    /// from the history.
    ///
    /// - Parameter historyManager: The history manager to use for storing conversions
    init(historyManager: HistoryManager) {
        self.historyManager = historyManager
        restoreLastShortUrl()
        if Self.isEnabled {
            startMonitoring()
        }
    }

    /// Whether clipboard monitoring is enabled (persisted in UserDefaults).
    static var isEnabled: Bool {
        get { UserDefaults.standard.object(forKey: "clipboardMonitoringEnabled") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "clipboardMonitoringEnabled") }
    }

    deinit {
        timer?.invalidate()
    }
}

// MARK: - Status

extension ClipboardMonitor {
    /// Represents the current state of the clipboard monitor.
    ///
    /// The status enum provides a type-safe way to represent the monitor's current
    /// state, with associated values containing relevant information for each state.
    ///
    /// ## Topics
    ///
    /// ### Status Cases
    /// - ``idle``
    /// - ``processing(url:)``
    /// - ``success(shortUrl:)``
    /// - ``error(message:)``
    ///
    /// ### Computed Properties
    /// - ``isProcessing``
    /// - ``errorMessage``
    enum Status: Equatable {
        /// Monitor is idle, waiting for clipboard changes
        case idle

        /// Currently processing a URL
        /// - Parameter url: The URL being processed
        case processing(url: String)

        /// Successfully converted a URL
        /// - Parameters:
        ///   - shortUrl: The resulting musiccloud.io short URL
        ///   - mediaType: The resolved content type (track, album, artist)
        case success(shortUrl: String, mediaType: MediaType)

        /// An error occurred during conversion
        /// - Parameter message: Human-readable error description
        case error(message: String)

        /// Returns `true` if currently processing a URL
        var isProcessing: Bool {
            if case .processing = self { return true }
            return false
        }

        /// Returns the error message if status is `.error`, otherwise `nil`
        var errorMessage: String? {
            if case .error(let message) = self { return message }
            return nil
        }
    }
}

// MARK: - Public API

extension ClipboardMonitor {
    /// Resolves a streaming service URL to a musiccloud.io short link.
    ///
    /// This method performs the following steps:
    /// 1. Updates status to `.processing`
    /// 2. Calls the musiccloud.io API to resolve the URL
    /// 3. Downloads artwork if available
    /// 4. Creates and stores a ``MediaEntry`` in the history
    /// 5. Updates the clipboard with the short URL
    /// 6. Updates status to `.success` or `.error`
    ///
    /// - Parameter url: The streaming service URL to resolve
    ///
    /// ## Example
    ///
    /// ```swift
    /// await monitor.resolve(url: "https://open.spotify.com/track/...")
    /// // Status changes: idle → processing → success/error
    /// // Clipboard now contains: "https://musiccloud.io/abc123"
    /// ```
    ///
    /// - Note: This method must be called from the main actor
    @MainActor
    func resolve(url: String) async {
        status = .processing(url: url)

        do {
            let result = try await MusicCloudAPI.resolve(url: url)

            // Determine content type and artwork URL
            let contentType = result.contentType
            let artworkUrlString: String? = switch contentType {
            case .track(let info): info.artworkUrl
            case .album(let info): info.artworkUrl
            case .artist(let info): info.artworkUrl
            }

            // Download artwork if available
            var artworkData: Data?
            if let artworkUrl = artworkUrlString {
                artworkData = await MusicCloudAPI.downloadArtwork(from: artworkUrl)
            }

            let entry = result.toMediaEntry(
                originalUrl: url,
                artworkData: artworkData
            )
            historyManager.add(entry)
            lastShortUrl = result.shortUrl
            setPasteboardString(result.shortUrl)
            lastSeenContent = result.shortUrl
            status = .success(shortUrl: result.shortUrl, mediaType: entry.mediaType)
            #if os(iOS)
            HapticFeedback.success()
            #endif
            NotificationManager.notifySuccess(entry: entry)
            AppLogger.clipboard.debug("resolve succeeded → \(result.shortUrl)")
        } catch {
            let errorMessage = error.localizedDescription
            status = .error(message: errorMessage)
            AppLogger.clipboard.error("resolve failed: \(errorMessage)")
        }
    }
}

// MARK: - Monitoring

extension ClipboardMonitor {
    /// Starts the clipboard monitoring timer.
    ///
    /// Creates a timer that fires every 1 second to check the clipboard for changes.
    /// The timer is added to the main run loop in common mode to ensure it continues
    /// running during UI interactions.
    func startMonitoring() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            MainActor.assumeIsolated {
                self.checkTask?.cancel()
                self.checkTask = Task { @MainActor in await self.checkClipboard() }
            }
        }
        guard let timer else { return }
        RunLoop.main.add(timer, forMode: .common)
    }

    /// Stops the clipboard monitoring timer.
    func stopMonitoring() {
        checkTask?.cancel()
        checkTask = nil
        resolveTask?.cancel()
        resolveTask = nil
        timer?.invalidate()
        timer = nil
    }
}

// MARK: - Clipboard Checking

private extension ClipboardMonitor {
    /// Checks the clipboard for new streaming service URLs.
    ///
    /// This method is called every second by the monitoring timer. It:
    /// 1. Reads the current clipboard content
    /// 2. Compares it to the last seen content to avoid duplicates
    /// 3. Checks if it's a streaming service URL using ``StreamingServices``
    /// 4. Automatically triggers ``resolve(url:)`` if a new streaming URL is detected
    ///
    /// - Note: This method must be called from the main actor
    @MainActor
    func checkClipboard() async {
        #if os(iOS)
        // Poll changeCount (no banner) then check hasURLs (no banner)
        // Only read .string on actual change with a URL (triggers one system banner)
        let currentCount = UIPasteboard.general.changeCount
        guard currentCount != lastChangeCount else { return }
        lastChangeCount = currentCount
        guard UIPasteboard.general.hasURLs else { return }
        #endif

        guard let raw = pasteboardString() else { return }
        let content = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }
        guard content != lastSeenContent else { return }

        lastSeenContent = content
        let isStreaming = StreamingServices.isStreamingURL(content)
        AppLogger.clipboard.debug("clipboard changed — isStreamingURL: \(isStreaming) — \(content)")
        guard isStreaming else { return }

        // Skip if a resolve is already in progress
        guard !status.isProcessing else { return }

        // Check if this URL was already resolved
        if let existing = historyManager.entry(forOriginalUrl: content) {
            lastShortUrl = existing.shortUrl
            setPasteboardString(existing.shortUrl)
            lastSeenContent = existing.shortUrl
            status = .success(shortUrl: existing.shortUrl, mediaType: existing.mediaType)
            AppLogger.clipboard.debug("already resolved → \(existing.shortUrl)")
            return
        }

        resolveTask = Task { @MainActor in await resolve(url: content) }
    }

    /// Restores the last short URL from the conversion history.
    ///
    /// Called during initialization to restore the most recent conversion
    /// from the history manager, if available.
    func restoreLastShortUrl() {
        lastShortUrl = historyManager.mostRecent?.shortUrl
    }
}

// MARK: - Pasteboard

private extension ClipboardMonitor {
    /// Reads the current string content from the system clipboard.
    ///
    /// - Returns: The clipboard string content, or `nil` if empty or unavailable
    ///
    /// - Note: Uses `NSPasteboard` on macOS and `UIPasteboard` on iOS
    func pasteboardString() -> String? {
#if os(macOS)
        NSPasteboard.general.string(forType: .string)
#else
        UIPasteboard.general.string
#endif
    }

    /// Writes a string to the system clipboard, replacing any existing content.
    ///
    /// On macOS, this clears the clipboard before setting the new string.
    /// On iOS, it directly sets the string value.
    ///
    /// - Parameter string: The string to write to the clipboard
    func setPasteboardString(_ string: String) {
#if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(string, forType: .string)
#else
        UIPasteboard.general.string = string
#endif
    }
}
