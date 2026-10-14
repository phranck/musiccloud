import Foundation
import Testing

// MARK: - GratConfig

/// Reads the local service ports from `grat.config` at the repository root.
///
/// The Debug builds of the app talk to the local stack, so the ports they
/// fall back to have to match the ones `grat` starts the services on.
enum GratConfig {
    /// The `port` of the service with the given `name`.
    static func port(ofService name: String) throws -> Int {
        let repositoryRoot = URL(filePath: #filePath)
            .deletingLastPathComponent() // Support
            .deletingLastPathComponent() // musiccloudTests
            .deletingLastPathComponent() // Apple
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent()
        let config = try String(contentsOf: repositoryRoot.appending(path: "grat.config"), encoding: .utf8)
        let services = config.components(separatedBy: "[[services]]")
        let service = try #require(services.first { $0.contains("name = '\(name)'") })
        let portLine = try #require(service.split(separator: "\n").first { $0.hasPrefix("port = ") })
        return try #require(Int(portLine.dropFirst("port = ".count)))
    }
}
