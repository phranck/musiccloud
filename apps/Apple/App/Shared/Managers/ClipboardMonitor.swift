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
/// - ``convert(url:)``
@Observable
@MainActor
final class ClipboardMonitor {
    private let historyManager: HistoryManager
    private var lastSeenContent: String?
    @ObservationIgnored
    private var pollTask: Task<Void, Never>?
    @ObservationIgnored
    private var resolveTask: Task<Void, Never>?
    @ObservationIgnored
    private var lastChangeCount: Int = -1

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
    ///
    /// Always `false` in the host app of a test run, so a streaming URL on the
    /// developer's clipboard is not converted into their history.
    static var isEnabled: Bool {
        get {
            guard !SharedStoreConfiguration.isHostingTests else { return false }
            return UserDefaults.standard.object(forKey: DefaultsKey.clipboardMonitoringEnabled) as? Bool ?? true
        }
        set { UserDefaults.standard.set(newValue, forKey: DefaultsKey.clipboardMonitoringEnabled) }
    }

    deinit {
        pollTask?.cancel()
        resolveTask?.cancel()
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
    /// - ``error(_:)``
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
        /// - Parameter error: Why the conversion failed
        case error(ResolveError)

        /// Returns `true` if currently processing a URL
        var isProcessing: Bool {
            if case .processing = self { return true }
            return false
        }

        /// Returns the localized error message if status is `.error`, otherwise `nil`
        var errorMessage: String? {
            if case .error(let error) = self { return error.errorDescription }
            return nil
        }
    }
}

// MARK: - Public API

extension ClipboardMonitor {
    /// Converts a streaming URL, unless a conversion is already running.
    ///
    /// Every source goes through here: the clipboard, the paste button, a
    /// dropped link and the `musiccloud://` link. One conversion runs at a
    /// time, because they all write the same ``status`` and the clipboard. A
    /// URL that is already in the history is answered from there instead of
    /// asking the backend again.
    ///
    /// - Parameter url: A URL that passed ``StreamingServices/isStreamingURL(_:)``.
    func convert(url: String) {
        guard !status.isProcessing else { return }

        if let existing = historyManager.entry(forOriginalUrl: url) {
            lastShortUrl = existing.shortUrl
            setPasteboardString(existing.shortUrl)
            lastSeenContent = existing.shortUrl
            status = .success(shortUrl: existing.shortUrl, mediaType: existing.mediaType)
            AppLogger.clipboard.debug("already resolved → \(existing.shortUrl)")
            return
        }

        status = .processing(url: url)
        resolveTask = Task { await resolve(url: url) }
    }
}

extension ClipboardMonitor {
    /// Whether an error only reports that the conversion was cancelled.
    ///
    /// `URLSession` reports a cancelled task as `URLError.cancelled` rather
    /// than as `CancellationError`, so both count.
    nonisolated static func isCancellation(_ error: any Error) -> Bool {
        error is CancellationError || (error as? URLError)?.code == .cancelled
    }
}

// MARK: - Resolving

private extension ClipboardMonitor {
    /// Resolves a streaming service URL to a musiccloud.io short link.
    ///
    /// Asks the backend, downloads the artwork, stores the entry in the
    /// history, puts the short link on the clipboard and sets ``status`` to
    /// `.success` or `.error`.
    ///
    /// A cancelled conversion is not a failure the user caused, so it returns
    /// to `.idle` and forgets the clipboard state. The next check then picks
    /// the same URL up again.
    ///
    /// - Parameter url: The streaming service URL to resolve
    func resolve(url: String) async {
        do {
            let result = try await MusicCloudAPI.resolve(url: url)

            var artworkData: Data?
            if let artworkUrl = result.contentType.artworkUrl {
                artworkData = await MusicCloudAPI.downloadArtwork(from: artworkUrl)
            }
            try Task.checkCancellation()

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
        } catch where Self.isCancellation(error) {
            status = .idle
            lastSeenContent = nil
            lastChangeCount = -1
            AppLogger.clipboard.debug("resolve cancelled")
        } catch {
            status = .error(ResolveError(error))
            AppLogger.clipboard.error("resolve failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Monitoring

extension ClipboardMonitor {
    /// How often the clipboard is checked while monitoring.
    static let pollInterval: Duration = .seconds(1)

    /// Starts checking the clipboard every ``pollInterval``.
    ///
    /// The loop runs on the main actor, like everything that reads the
    /// pasteboard, and holds the monitor only weakly, so it ends with it.
    func startMonitoring() {
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                self.checkClipboard()
                try? await Task.sleep(for: Self.pollInterval)
            }
        }
    }

    /// Stops checking the clipboard and cancels a running conversion.
    func stopMonitoring() {
        pollTask?.cancel()
        pollTask = nil
        resolveTask?.cancel()
        resolveTask = nil
    }
}

// MARK: - Clipboard Checking

private extension ClipboardMonitor {
    /// Checks the clipboard for new streaming service URLs.
    ///
    /// This method is called every ``pollInterval`` while monitoring. It:
    /// 1. Reads the current clipboard content
    /// 2. Compares it to the last seen content to avoid duplicates
    /// 3. Checks if it's a streaming service URL using ``StreamingServices``
    /// 4. Hands a new streaming URL to ``convert(url:)``
    ///
    /// - Note: This method must be called from the main actor
    func checkClipboard() {
        // A URL copied while a conversion runs is picked up afterwards: the
        // change count is only consumed once nothing is converting.
        guard !status.isProcessing else { return }

        // The change count is read without touching the content, so the
        // clipboard is only read after it changed. On iOS that also keeps the
        // paste banner from appearing once a second.
        #if os(iOS)
        let currentCount = UIPasteboard.general.changeCount
        #else
        let currentCount = NSPasteboard.general.changeCount
        #endif
        guard currentCount != lastChangeCount else { return }
        lastChangeCount = currentCount

        #if os(iOS)
        guard UIPasteboard.general.hasURLs else { return }
        #else
        guard !Self.holdsConcealedContent(NSPasteboard.general) else { return }
        #endif

        guard let raw = pasteboardString() else { return }
        let content = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }
        guard content != lastSeenContent else { return }

        lastSeenContent = content
        // Whatever else was copied stays out of the log: it can be a
        // password, a message or anything else the user had in hand.
        guard StreamingServices.isStreamingURL(content) else { return }
        AppLogger.clipboard.debug("clipboard holds a streaming URL")

        convert(url: content)
    }

    /// Restores the last short URL from the conversion history.
    ///
    /// Called during initialization to restore the most recent conversion
    /// from the history manager, if available.
    func restoreLastShortUrl() {
        lastShortUrl = historyManager.mostRecent?.shortUrl
    }
}

// MARK: - Private Content

#if os(macOS)
extension ClipboardMonitor {
    /// Whether the pasteboard holds content its source marked as private.
    ///
    /// Password managers mark copied passwords and one-time codes with the
    /// types from nspasteboard.org, so clipboard tools leave them alone.
    static func holdsConcealedContent(_ pasteboard: NSPasteboard) -> Bool {
        let privateTypes: Set<NSPasteboard.PasteboardType> = [
            NSPasteboard.PasteboardType("org.nspasteboard.ConcealedType"),
            NSPasteboard.PasteboardType("org.nspasteboard.TransientType"),
            NSPasteboard.PasteboardType("org.nspasteboard.AutoGeneratedType"),
        ]
        return pasteboard.types?.contains(where: privateTypes.contains) == true
    }
}
#endif

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
