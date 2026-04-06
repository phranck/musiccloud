//
//  SidebarFooterItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import Foundation

/// Footer navigation items for the dashboard sidebar.
enum SidebarFooterItem: String, Hashable {
    case about
    case settings
}

// MARK: - Public API

extension SidebarFooterItem {
    var title: String {
        switch self {
        case .about:    String(localized: "About")
        case .settings: String(localized: "Settings")
        }
    }

    var icon: String {
        switch self {
        case .about:    "info.circle"
        case .settings: "gearshape"
        }
    }
}
