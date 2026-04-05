import CoreData
import Foundation
import OSLog
import SwiftData

// MARK: - Public API

/// Manages the history of URL conversions with SwiftData and CloudKit sync.
@Observable
final class HistoryManager {
    private let logger = Logger(subsystem: "io.musiccloud.app", category: "HistoryManager")
    private let modelContext: ModelContext
    private var remoteChangeObserver: Any?

    /// All entries sorted by date (newest first), updated after every mutation.
    private(set) var entries: [MediaEntry] = []

    /// Creates a new history manager.
    ///
    /// - Parameter modelContext: The SwiftData model context for persistence
    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        refreshEntries()
        observeRemoteChanges()
    }

    deinit {
        if let observer = remoteChangeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    /// Adds a new conversion entry to the history.
    ///
    /// - Parameter entry: The conversion entry to add
    func add(_ entry: MediaEntry) {
        modelContext.insert(entry)
        save()
        refreshEntries()
        logger.debug("Added entry: \(entry.shortUrl)")
        NotificationCenter.default.post(name: .historyDidChange, object: nil)
    }

    /// Removes a specific conversion entry from the history.
    ///
    /// - Parameter entry: The entry to remove
    func remove(_ entry: MediaEntry) {
        modelContext.delete(entry)
        save()
        refreshEntries()
        logger.debug("Removed entry: \(entry.id)")
        NotificationCenter.default.post(name: .historyDidChange, object: nil)
    }

    /// Clears all conversion entries from the history.
    func clear() {
        do {
            try modelContext.delete(model: MediaEntry.self)
            save()
            refreshEntries()
            logger.debug("Cleared all entries")
            NotificationCenter.default.post(name: .historyDidChange, object: nil)
        } catch {
            logger.error("Failed to clear entries: \(error.localizedDescription)")
        }
    }

    /// The most recently added conversion entry.
    var mostRecent: MediaEntry? {
        var descriptor = FetchDescriptor<MediaEntry>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        return try? modelContext.fetch(descriptor).first
    }

    /// Finds an existing entry by its original URL.
    ///
    /// Used for duplicate detection in the clipboard monitor.
    func entry(forOriginalUrl url: String) -> MediaEntry? {
        let descriptor = FetchDescriptor<MediaEntry>(
            predicate: #Predicate { $0.originalUrl == url }
        )
        return try? modelContext.fetch(descriptor).first
    }
}

// MARK: - Private API

private extension HistoryManager {
    /// Observes CloudKit remote change notifications and refreshes entries.
    func observeRemoteChanges() {
        remoteChangeObserver = NotificationCenter.default.addObserver(
            forName: .NSPersistentStoreRemoteChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.logger.debug("Remote change detected, refreshing entries")
            self.refreshEntries()
        }
    }

    /// Refreshes the `entries` array from the model context.
    func refreshEntries() {
        let descriptor = FetchDescriptor<MediaEntry>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        entries = (try? modelContext.fetch(descriptor)) ?? []
    }

    /// Saves the model context, logging any errors.
    func save() {
        do {
            try modelContext.save()
        } catch {
            logger.error("Save failed: \(error)")
        }
    }
}

// MARK: - Notifications

extension Notification.Name {
    static let historyDidChange = Notification.Name("io.musiccloud.historyDidChange")
}
