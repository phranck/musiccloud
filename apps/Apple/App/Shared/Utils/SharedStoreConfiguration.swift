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

    static var modelConfiguration: ModelConfiguration {
        ModelConfiguration(
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
