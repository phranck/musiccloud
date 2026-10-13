import Foundation
import SwiftData

// MARK: - Schema Versioning

enum MediaEntrySchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }
    static var models: [any PersistentModel.Type] { [MediaEntry.self] }
}

enum MediaEntryMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] { [MediaEntrySchemaV1.self] }
    static var stages: [MigrationStage] { [] }
}

// MARK: - SharedStoreConfiguration

/// Central configuration for the shared SwiftData store across App and ShareExtension.
enum SharedStoreConfiguration {
    static let cloudKitContainerIdentifier = "iCloud.io.musiccloud.shared"

    /// Whether this process is the host app of a test run.
    ///
    /// The unit tests run inside the app, so launching it must not open the
    /// user's history in the App Group container or start watching the
    /// clipboard. Xcode sets `XCTestConfigurationFilePath` for every hosted
    /// test run, Swift Testing included.
    static let isHostingTests = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil

    static var modelConfiguration: ModelConfiguration {
        if isHostingTests {
            return ModelConfiguration(isStoredInMemoryOnly: true, cloudKitDatabase: .none)
        }
        return ModelConfiguration(
            "default",
            groupContainer: .identifier("group.io.musiccloud"),
            cloudKitDatabase: .private(cloudKitContainerIdentifier)
        )
    }

    static func makeContainer() throws -> ModelContainer {
        try ModelContainer(
            for: MediaEntry.self,
            migrationPlan: MediaEntryMigrationPlan.self,
            configurations: modelConfiguration
        )
    }
}
