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
    /// Stored in ``shared``.
    static let playNotificationSound = "playNotificationSound"

    /// The raw value of the chosen ``NotificationSound``. Stored in ``shared``.
    static let notificationSound = "notificationSound"

    /// The edge length of a card in the macOS history grid, in points.
    static let gridItemSize = "gridItemSize"

    /// The raw value of the pane the macOS Settings window showed last.
    static let settingsPane = "settingsPane"

    /// Whether the Template Editor shows the variable legend. Defaults to `true`.
    static let templateLegendVisible = "templateLegendVisible"

    /// ``AutoPostSettings`` as JSON: the master switch and each account's switch.
    static let autoPost = "autoPost"

    /// ``DefaultTemplates`` as JSON: the template each account posts with, where the user chose one.
    static let defaultTemplates = "defaultTemplates"

    /// The IDs of ``StreamingServices/Service`` the user turned off in Settings, as a string array. Stored in ``shared``.
    static let disabledStreamingServices = "disabledStreamingServices"
}

// MARK: - Shared Settings

extension DefaultsKey {
    /// The keys stored in ``shared``, because the share extension reads them too.
    static let sharedKeys = [playNotificationSound, notificationSound, disabledStreamingServices]

    /// The app group's defaults, which the app and the share extension both read.
    ///
    /// The app's own `UserDefaults.standard` is out of the extension's reach,
    /// so a setting the extension follows lives here. `UserDefaults` is not
    /// `Sendable`, so each access opens the suite rather than keeping one.
    ///
    /// A hosted test run uses its own suite instead of the app group, the
    /// same way ``SharedStoreConfiguration/modelConfiguration`` keeps the
    /// history in memory during tests: the test host is the real app, and
    /// writing to the real app group would change the developer's own
    /// settings.
    static var shared: UserDefaults {
        let suiteName = SharedStoreConfiguration.isHostingTests ? "group.io.musiccloud.tests" : SharedStoreConfiguration.appGroupIdentifier
        return UserDefaults(suiteName: suiteName) ?? .standard
    }

    /// Moves the ``sharedKeys`` that an earlier version stored in the app's
    /// own defaults into the shared ones, so a choice made before survives.
    ///
    /// A key already set in `target` keeps its value, and the old copy is
    /// removed either way, so running this again changes nothing.
    ///
    /// - Parameters:
    ///   - source: The defaults an earlier version wrote. The app's own by default.
    ///   - target: The defaults the settings live in now. ``shared`` by default.
    static func moveSharedSettings(from source: UserDefaults = .standard, to target: UserDefaults = shared) {
        guard source !== target
        else {
            return
        }
        for key in sharedKeys {
            guard let value = source.object(forKey: key)
            else {
                continue
            }
            if target.object(forKey: key) == nil { target.set(value, forKey: key) }
            source.removeObject(forKey: key)
        }
    }
}
