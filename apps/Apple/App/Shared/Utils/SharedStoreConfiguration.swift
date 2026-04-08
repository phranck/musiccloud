import Foundation
import SwiftData

// MARK: - SharedStoreConfiguration

/// Central configuration for the shared SwiftData store across App and ShareExtension.
enum SharedStoreConfiguration {
    static let cloudKitContainerIdentifier = "iCloud.io.musiccloud.shared"

    static var modelConfiguration: ModelConfiguration {
        ModelConfiguration(
            "default",
            groupContainer: .identifier("group.io.musiccloud"),
            cloudKitDatabase: .private(cloudKitContainerIdentifier)
        )
    }

    static func makeContainer() throws -> ModelContainer {
        try ModelContainer(for: MediaEntry.self, configurations: modelConfiguration)
    }
}
