import Foundation

// MARK: - Bundle+Version

extension Bundle {
    /// The app's display name from `CFBundleDisplayName`, falling back to `CFBundleName`.
    var appName: String {
        infoDictionary?["CFBundleDisplayName"] as? String
            ?? infoDictionary?["CFBundleName"] as? String
            ?? "musiccloud"
    }

    /// Formatted version string combining marketing version and build number, e.g. `"1.2.0 (42)"`.
    var appVersion: String {
        let version = infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }
}
