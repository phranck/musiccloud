import Foundation

// MARK: - DefaultsKey

/// The `UserDefaults` keys the app stores its settings under.
///
/// A setting is written by a settings screen through `@AppStorage` and read
/// elsewhere, for example by ``NotificationManager`` when a conversion
/// finishes. Both sides name the key through this enum, so a screen cannot
/// write a key that nothing reads.
enum DefaultsKey {
    /// Whether the clipboard is watched for streaming URLs. Defaults to `true`.
    static let clipboardMonitoringEnabled = "clipboardMonitoringEnabled"

    /// Whether a sound plays after a conversion. Defaults to `true`.
    static let playNotificationSound = "playNotificationSound"

    /// The raw value of the chosen ``NotificationSound``.
    static let notificationSound = "notificationSound"

    /// The edge length of a card in the macOS history grid, in points.
    static let gridItemSize = "gridItemSize"

    /// The raw value of the pane the macOS Settings window showed last.
    static let settingsPane = "settingsPane"

    /// Whether the Template Editor shows the variable legend. Defaults to `true`.
    static let templateLegendVisible = "templateLegendVisible"

    /// ``AutoPostSettings`` as JSON: the master switch and each account's switch and default template.
    static let autoPost = "autoPost"
}
