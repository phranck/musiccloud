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
    case templates
    case about

    var id: String { rawValue }

    /// Whether the pane sits at the bottom of the sidebar, apart from the
    /// settings, because it shows information rather than settings.
    var isPinnedToBottom: Bool { self == .about }

    /// The panes listed from the top of the sidebar.
    static var topPanes: [SettingsPane] { allCases.filter { !$0.isPinnedToBottom } }

    /// The panes at the bottom edge of the sidebar.
    static var bottomPanes: [SettingsPane] { allCases.filter(\.isPinnedToBottom) }

    /// The name shown in the sidebar and as the window title.
    var title: String {
        switch self {
        case .general:       String(localized: "General")
        case .notifications: String(localized: "Notifications")
        case .history:       String(localized: "History")
        case .templates:     String(localized: "Templates")
        case .about:         String(localized: "About")
        }
    }

    /// The SF Symbol shown beside the title in the sidebar.
    var icon: String {
        switch self {
        case .general:       "gearshape"
        case .notifications: "bell.badge"
        case .history:       "clock.arrow.circlepath"
        case .templates:     "text.bubble"
        case .about:         "info.circle"
        }
    }
}

#endif
