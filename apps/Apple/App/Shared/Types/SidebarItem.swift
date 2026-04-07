//
//  SidebarItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import Foundation

/// Sidebar navigation items for the dashboard.
enum SidebarItem: String, Hashable, CaseIterable {
    case tracks
    case albums
    case artists
}

// MARK: - Public API

extension SidebarItem {
    var title: String {
        switch self {
        case .tracks:  String(localized: "Tracks")
        case .albums:  String(localized: "Albums")
        case .artists: String(localized: "Artists")
        }
    }

    var icon: String {
        switch self {
        case .tracks:  "music.note"
        case .albums:  "square.stack"
        case .artists: "person.circle"
        }
    }

    var mediaType: String {
        switch self {
        case .tracks:  "track"
        case .albums:  "album"
        case .artists: "artist"
        }
    }

    var emptyPanelTitle: String {
        switch self {
        case .tracks:  String(localized: "No Tracks")
        case .albums:  String(localized: "No Albums")
        case .artists: String(localized: "No Artists")
        }
    }

    var emptyTitle: String {
        switch self {
        case .tracks:  String(localized: "No Tracks")
        case .albums:  String(localized: "No Albums")
        case .artists: String(localized: "No Artists")
        }
    }

    var emptyDescription: String {
        switch self {
        case .tracks:  String(localized: "Resolved tracks will appear here.")
        case .albums:  String(localized: "Resolved albums will appear here.")
        case .artists: String(localized: "Resolved artists will appear here.")
        }
    }
}
