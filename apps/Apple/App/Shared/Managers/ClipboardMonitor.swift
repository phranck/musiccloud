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
/// - ``origin``
/// - ``conversionCount``
///
/// ### Status Types
/// - ``Status``
/// - ``Origin``
///
/// ### Methods
/// - ``convert(url:origin:)``
@Observable
@MainActor
final class ClipboardMonitor {
    private let historyManager: HistoryManager
    /// Keeps hosted tests from replacing the device's actual clipboard.
    private let copyToPasteboard: @MainActor (String) -> Void
    private var lastSeenContent: String?
    @ObservationIgnored
    private var pollTask: Task<Void, Never>?
    @ObservationIgnored
    private var resolveTask: Task<Void, Never>?
    @ObservationIgnored
    private var lastChangeCount: Int = -1

    var status: Status = .idle

    /// Where the last conversion that started came from.
    private(set) var origin: Origin = .request

    /// How many conversions have started, so an observer sees each start.
    ///
    /// ``status`` alone does not show one: the same URL answered from the
    /// history twice sets the same `.success` again, which is no change to
    /// observe. It counts up after ``origin`` is set, so an observer of the
    /// count reads the origin of the conversion that just started.
    private(set) var conversionCount = 0

    /// Called with every entry a conversion adds to the history, after it is
    /// stored. An entry answered from the history is not new and is not passed.
    /// The macOS app posts it automatically to the accounts chosen for that.
    @ObservationIgnored
    var onNewEntry: (@MainActor (MediaEntry) -> Void)?

    /// Creates a new clipboard monitor.
    ///
    /// Starts monitoring the clipboard when monitoring is enabled.
    ///
    /// - Parameters:
    ///   - historyManager: The history manager to use for storing conversions.
    ///   - copyToPasteboard: Writes a converted link. Defaults to the system clipboard;
    ///     tests supply an isolated sink so they never replace existing clipboard data.
    init(historyManager: HistoryManager, copyToPasteboard: @escaping @MainActor (String) -> Void = { Pasteboard.copy($0) }) {
        self.historyManager = historyManager
        self.copyToPasteboard = copyToPasteboard
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

    /// Where a conversion was started.
    ///
    /// The iOS app opens its conversion sheet only for a URL it found on the
    /// clipboard by itself. A link the user handed over through the paste
    /// button, a drop or a `musiccloud://` link shows its result in place.
    enum Origin: Equatable {
        /// The clipboard check found the URL.
        case clipboard
        /// The user handed the URL over: the paste button, a dropped link or a `musiccloud://` link.
        case request
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
    /// - Parameters:
    ///   - url: A URL that passed ``StreamingServices/isStreamingURL(_:)``.
    ///   - origin: Where the URL came from; ``Origin/request`` unless the clipboard check found it.
    func convert(url: String, origin: Origin = .request) {
        guard !status.isProcessing else { return }
        self.origin = origin
        conversionCount += 1

        if let existing = historyManager.entry(forOriginalUrl: url) {
            copyToPasteboard(existing.shortUrl)
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
            let conversion = try await MusicCloudAPI.convert(url: url)
            try Task.checkCancellation()

            let entry = conversion.makeEntry(originalUrl: url)
            let shortUrl = conversion.response.shortUrl
            historyManager.add(entry)
            copyToPasteboard(shortUrl)
            lastSeenContent = shortUrl
            status = .success(shortUrl: shortUrl, mediaType: entry.mediaType)
            #if os(iOS)
            HapticFeedback.success()
            #endif
            NotificationManager.notifySuccess(entry: entry)
            onNewEntry?(entry)
            AppLogger.clipboard.debug("resolve succeeded → \(shortUrl)")
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
                await self.checkClipboard()
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
    /// 4. Hands a new streaming URL to ``convert(url:origin:)``
    ///
    /// - Note: This method must be called from the main actor
    func checkClipboard() async {
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
        // Only the change count and the type identifiers are logged here.
        // Whatever was copied stays out of the log unless it is a streaming
        // URL: it can be a password, a message or anything else in hand.
        let log = AppLogger.clipboard

        #if os(iOS)
        let pasteboard = UIPasteboard.general
        log.info("change \(currentCount), hasURLs \(pasteboard.hasURLs), hasStrings \(pasteboard.hasStrings), types \(pasteboard.types.joined(separator: ", "), privacy: .public)")
        // `hasURLs` only sees a `public.url` item, so a link copied as text,
        // such as from Notes, would pass unseen. Pattern detection finds a
        // link in text as well and, unlike reading the string, raises no
        // paste prompt; the prompt comes only for a clipboard that holds one.
        let patterns = (try? await pasteboard.detectedPatterns(for: [\UIPasteboard.DetectedValues.probableWebURL])) ?? []
        guard patterns.contains(\UIPasteboard.DetectedValues.probableWebURL) else {
            log.info("skipped: no web URL on the clipboard")
            return
        }
        // A conversion may have started while the detection ran.
        guard !status.isProcessing else { return }
        #else
        log.info("change \(currentCount), types \((NSPasteboard.general.types ?? []).map(\.rawValue).joined(separator: ", "), privacy: .public)")
        guard !Self.holdsConcealedContent(NSPasteboard.general) else {
            log.info("skipped: concealed content")
            return
        }
        #endif

        guard let raw = Pasteboard.string else {
            log.info("skipped: no string on the clipboard")
            return
        }
        let content = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else {
            log.info("skipped: empty string")
            return
        }
        guard content != lastSeenContent else {
            log.info("skipped: same content as last time")
            return
        }

        lastSeenContent = content
        guard StreamingServices.isStreamingURL(content) else {
            log.info("skipped: not a streaming URL")
            return
        }
        log.info("clipboard holds a streaming URL: \(content, privacy: .public), status \(String(describing: self.status), privacy: .public)")

        convert(url: content, origin: .clipboard)
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
