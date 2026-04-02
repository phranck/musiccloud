import Foundation
import OSLog

// MARK: - HistoryManager

@Observable
final class HistoryManager {
  private let logger = Logger(subsystem: "io.musiccloud.app", category: "HistoryManager")
  private let store = NSUbiquitousKeyValueStore.default
  private let maxEntries = 100
  
  private(set) var entries: [ConversionEntry] = []
  
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
  func add(_ entry: ConversionEntry) {
    // Füge am Anfang ein (neueste zuerst)
    entries.insert(entry, at: 0)
    
    // Begrenze auf maxEntries
    if entries.count > maxEntries {
      entries = Array(entries.prefix(maxEntries))
    }
    
    save()
    logger.debug("Added entry: \(entry.shortUrl)")
  }
  
  func remove(_ entry: ConversionEntry) {
    entries.removeAll { $0.id == entry.id }
    save()
    logger.debug("Removed entry: \(entry.id)")
  }
  
  func clear() {
    entries.removeAll()
    save()
    logger.debug("Cleared all entries")
  }
  
  var mostRecent: ConversionEntry? {
    entries.first
  }
}

// MARK: - Persistence

private extension HistoryManager {
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
  
  func loadEntries() {
    guard let data = store.data(forKey: "history") else {
      logger.debug("No stored history found")
      return
    }
    
    do {
      entries = try JSONDecoder().decode([ConversionEntry].self, from: data)
      logger.debug("Loaded \(self.entries.count) entries from iCloud")
    } catch {
      logger.error("Failed to load: \(error.localizedDescription)")
    }
  }
}

// MARK: - iCloud Sync

private extension HistoryManager {
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
  
  @objc func cloudStoreDidChange(_ notification: Notification) {
    logger.debug("iCloud store changed externally")
    loadEntries()
  }
}
