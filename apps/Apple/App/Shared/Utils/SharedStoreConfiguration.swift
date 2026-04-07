import Foundation
import SwiftData

// MARK: - SharedStoreConfiguration

/// Central configuration for the shared SwiftData store across App and ShareExtension.
enum SharedStoreConfiguration {
    static let appGroupIdentifier = "group.io.musiccloud"

    static var storeURL: URL {
        let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)!
        let directory = groupURL.appendingPathComponent("Library/Application Support", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("default.store")
    }

    static var modelConfiguration: ModelConfiguration {
        ModelConfiguration(url: storeURL, cloudKitDatabase: .automatic)
    }

    static func makeContainer() throws -> ModelContainer {
        try ModelContainer(for: MediaEntry.self, configurations: modelConfiguration)
    }
}
