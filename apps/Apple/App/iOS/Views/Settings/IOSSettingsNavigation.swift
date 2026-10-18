#if os(iOS)
import SwiftUI

/// A destination in the iPhone Settings overview, independent of preference storage.
enum IOSSettingsDestination: String, CaseIterable, Identifiable {
    case general, streamingServices, socialMedia, diagnostics, about, dataManagement

    /// Stable navigation identity; it never changes stored preference keys.
    var id: Self { self }

    /// The localized label shared by the overview row and destination title.
    var title: String {
        switch self {
        case .general: String(localized: "General")
        case .streamingServices: String(localized: "Streaming Services")
        case .socialMedia: String(localized: "Social Media")
        case .diagnostics: String(localized: "Diagnostics")
        case .about: String(localized: "About")
        case .dataManagement: String(localized: "Data Management")
        }
    }

    /// A system symbol identifying the setting category without replacing its text label.
    var symbol: String {
        switch self {
        case .general: "gearshape"
        case .streamingServices: "music.note.list"
        case .socialMedia: "person.2"
        case .diagnostics: "stethoscope"
        case .about: "info.circle"
        case .dataManagement: "externaldrive"
        }
    }
}

/// Meaningful groups keep support and destructive data operations separate from preferences.
enum IOSSettingsGroup: String, CaseIterable, Identifiable {
    case preferences, connections, support, data

    /// Stable group identity for the overview list.
    var id: Self { self }

    /// Localized section heading.
    var title: String {
        switch self {
        case .preferences: String(localized: "Preferences")
        case .connections: String(localized: "Connections")
        case .support: String(localized: "Support")
        case .data: String(localized: "Data Management")
        }
    }

    /// Lists destinations exposed by this build without creating their views or changing data.
    /// - Parameter diagnosticsEnabled: Whether this build channel allows diagnostic export.
    /// - Returns: Destinations belonging to this group and permitted by the channel.
    func destinations(diagnosticsEnabled: Bool) -> [IOSSettingsDestination] {
        switch self {
        case .preferences: [.general, .streamingServices]
        case .connections: [.socialMedia]
        case .support: diagnosticsEnabled ? [.diagnostics, .about] : [.about]
        case .data: [.dataManagement]
        }
    }
}
#endif
