import Foundation
import OSLog
import SwiftData

// MARK: - Public API

/// Provides CRUD operations for the conversion history.
///
/// All queries are handled by SwiftData's `@Query` in the views.
/// This class only manages mutations (add, remove, clear) and
/// lookup operations needed by ``ClipboardMonitor``.
@Observable
@MainActor
final class HistoryManager {
    private let logger = Logger(subsystem: "io.musiccloud.app", category: "HistoryManager")
    private let modelContext: ModelContext

    /// Creates a new history manager.
    ///
    /// - Parameter modelContext: The SwiftData model context for persistence
    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    /// Adds a new conversion entry to the history.
    ///
    /// - Parameter entry: The conversion entry to add
    func add(_ entry: MediaEntry) {
        modelContext.insert(entry)
        save()
        logger.debug("Added entry: \(entry.shortUrl)")
    }

    /// Removes a specific conversion entry from the history.
    ///
    /// - Parameter entry: The entry to remove
    func remove(_ entry: MediaEntry) {
        modelContext.delete(entry)
        save()
        logger.debug("Removed entry: \(entry.id)")
    }

    /// Clears all conversion entries from the history.
    func clear() {
        do {
            try modelContext.delete(model: MediaEntry.self)
            save()
            logger.debug("Cleared all entries")
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
    /// Saves the model context, logging any errors.
    func save() {
        do {
            try modelContext.save()
        } catch {
            logger.error("Save failed: \(error)")
        }
    }
}
