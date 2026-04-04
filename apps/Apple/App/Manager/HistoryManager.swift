import Foundation
import OSLog

// MARK: - HistoryManager

/// Manages the history of URL conversions with iCloud sync support.
///
/// `HistoryManager` stores conversion entries locally and syncs them across devices
/// using `NSUbiquitousKeyValueStore`. It automatically handles persistence, limits
/// the number of stored entries, and publishes changes to SwiftUI views.
///
/// ## Features
///
/// - **iCloud Sync**: Automatically syncs conversion history across all user devices
/// - **Persistence**: Entries are saved and restored between app launches
/// - **Size Limit**: Keeps only the most recent 100 conversions
/// - **Observable**: Uses `@Observable` macro for SwiftUI integration
///
/// ## Usage
///
/// ```swift
/// let historyManager = HistoryManager()
///
/// // Add a new conversion
/// historyManager.add(entry)
///
/// // Access all entries
/// let allConversions = historyManager.entries
///
/// // Get the most recent conversion
/// if let latest = historyManager.mostRecent {
///     print(latest.shortUrl)
/// }
/// ```
///
/// ## Topics
///
/// ### Initialization
/// - ``init()``
///
/// ### Managing Entries
/// - ``add(_:)``
/// - ``remove(_:)``
/// - ``clear()``
///
/// ### Accessing Entries
/// - ``entries``
/// - ``mostRecent``
@Observable
final class HistoryManager {
    private let logger = Logger(subsystem: "io.musiccloud.app", category: "HistoryManager")
    private let store = NSUbiquitousKeyValueStore.default
    private let maxEntries = 100

    private(set) var entries: [MediaInfo] = []

    /// Creates a new history manager.
    ///
    /// Automatically loads existing entries from iCloud and sets up sync notifications.
    init() {
        loadEntries()
        setupCloudSync()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}

// MARK: - Public API

extension HistoryManager {
    /// Adds a new conversion entry to the history.
    ///
    /// The entry is inserted at the beginning of the list (newest first) and
    /// automatically saved to iCloud. If the total number of entries exceeds
    /// the maximum (100), the oldest entries are removed.
    ///
    /// - Parameter entry: The conversion entry to add
    ///
    /// ## Example
    ///
    /// ```swift
    /// let entry = MediaInfo(
    ///     originalUrl: "https://open.spotify.com/track/...",
    ///     shortUrl: "https://musiccloud.io/abc123",
    ///     contentType: .track(info: trackInfo)
    /// )
    /// historyManager.add(entry)
    /// ```
    func add(_ entry: MediaInfo) {
        // Replace entire array to ensure @Observable triggers change notification
        var updated = entries
        updated.insert(entry, at: 0)
        if updated.count > maxEntries {
            updated = Array(updated.prefix(maxEntries))
        }
        entries = updated

        save()
        logger.debug("Added entry: \(entry.shortUrl)")
    }

    /// Removes a specific conversion entry from the history.
    ///
    /// - Parameter entry: The entry to remove
    ///
    /// ## Example
    ///
    /// ```swift
    /// if let entryToRemove = historyManager.entries.first(where: { $0.id == someId }) {
    ///     historyManager.remove(entryToRemove)
    /// }
    /// ```
    func remove(_ entry: MediaInfo) {
        entries.removeAll { $0.id == entry.id }
        save()
        logger.debug("Removed entry: \(entry.id)")
    }

    /// Clears all conversion entries from the history.
    ///
    /// This operation is permanent and syncs the empty state to iCloud.
    ///
    /// ## Example
    ///
    /// ```swift
    /// historyManager.clear()
    /// // historyManager.entries is now empty
    /// ```
    func clear() {
        entries.removeAll()
        save()
        logger.debug("Cleared all entries")
    }

    /// The most recently added conversion entry.
    ///
    /// - Returns: The first entry in the history, or `nil` if history is empty
    ///
    /// ## Example
    ///
    /// ```swift
    /// if let latest = historyManager.mostRecent {
    ///     print("Last converted: \(latest.shortUrl)")
    /// }
    /// ```
    var mostRecent: MediaInfo? {
        entries.first
    }
}

// MARK: - Persistence

private extension HistoryManager {
    /// Saves the current entries to iCloud key-value store.
    ///
    /// Encodes all entries as JSON and stores them in `NSUbiquitousKeyValueStore`.
    /// Automatically triggers synchronization with iCloud servers.
    ///
    /// - Note: Failures are logged but do not throw errors
    func save() {
        do {
            let data = try JSONEncoder().encode(entries)
            store.set(data, forKey: "history")
            store.synchronize()
            logger.debug("Saved \(self.entries.count) entries to iCloud")
        } catch {
            logger.error("Failed to save: \(error.localizedDescription)")
        }
    }

    /// Loads conversion entries from iCloud key-value store.
    ///
    /// Called during initialization to restore previously saved entries.
    /// If no data is found or decoding fails, the history remains empty.
    ///
    /// - Note: Failures are logged but do not throw errors
    func loadEntries() {
        guard let data = store.data(forKey: "history") else {
            logger.debug("No stored history found")
            return
        }

        do {
            entries = try JSONDecoder().decode([MediaInfo].self, from: data)
            logger.debug("Loaded \(self.entries.count) entries from iCloud")
        } catch {
            logger.error("Failed to load: \(error.localizedDescription)")
        }
    }
}

// MARK: - iCloud Sync

private extension HistoryManager {
    /// Sets up iCloud synchronization notifications.
    ///
    /// Registers for `didChangeExternallyNotification` to detect when the iCloud
    /// key-value store is updated from another device. Triggers an initial sync
    /// to fetch the latest data.
    ///
    /// ## Synchronization Behavior
    ///
    /// - Changes made on other devices automatically update local entries
    /// - Initial sync happens immediately after setup
    /// - All sync events are logged for debugging
    func setupCloudSync() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cloudStoreDidChange),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: store
        )

        // Trigger initial sync
        store.synchronize()
        logger.debug("iCloud sync configured")
    }

    /// Handles external changes to the iCloud key-value store.
    ///
    /// Called automatically when another device modifies the history data.
    /// Reloads all entries to stay in sync with the latest iCloud state.
    ///
    /// - Parameter notification: The change notification from `NSUbiquitousKeyValueStore`
    @objc func cloudStoreDidChange(_ notification: Notification) {
        logger.debug("iCloud store changed externally")
        loadEntries()
    }
}
