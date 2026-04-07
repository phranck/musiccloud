import AppIntents

// MARK: - MusicCloudShortcutsProvider

/// Provides app shortcuts for Siri and the Shortcuts app.
struct MusicCloudShortcutsProvider: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ConvertStreamingURLIntent(),
            phrases: [
                "Convert a streaming link with \(.applicationName)",
                "Convert streaming URL with \(.applicationName)",
            ],
            shortTitle: "Convert Streaming URL",
            systemImageName: "link"
        )
    }
}
