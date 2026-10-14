#if os(macOS)
//
//  SettingsPane.swift
//  musiccloud
//

import Foundation

// MARK: - SettingsPane

/// The topics of the Settings window, in sidebar order.
///
/// The raw value is stored under ``DefaultsKey/settingsPane``, so renaming a
/// case makes the window forget the pane it showed last.
enum SettingsPane: String, CaseIterable, Identifiable {
    case general
    case notifications
    case history
    case about

    var id: String { rawValue }

    /// The name shown in the sidebar and as the window title.
    var title: String {
        switch self {
        case .general:       String(localized: "General")
        case .notifications: String(localized: "Notifications")
        case .history:       String(localized: "History")
        case .about:         String(localized: "About")
        }
    }

    /// The SF Symbol shown beside the title in the sidebar.
    var icon: String {
        switch self {
        case .general:       "gearshape"
        case .notifications: "bell.badge"
        case .history:       "clock.arrow.circlepath"
        case .about:         "info.circle"
        }
    }
}

#endif
