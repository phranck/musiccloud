//
//  MediaFilter.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import Foundation

/// Filter for media content types used across iOS and macOS.
enum MediaFilter: String, Hashable, CaseIterable, Identifiable {
    case all
    case tracks
    case albums
    case artists

    var id: String { rawValue }

    /// Cases without `.all`, used by macOS views that show per-type tabs.
    static let mediaOnlyCases: [MediaFilter] = [.tracks, .albums, .artists]

    /// Returns the filter matching the given media type.
    init(for mediaType: MediaType) {
        switch mediaType {
        case .track:  self = .tracks
        case .album:  self = .albums
        case .artist: self = .artists
        }
    }
}

// MARK: - Public API

extension MediaFilter {
    var title: String {
        switch self {
        case .all:     String(localized: "All")
        case .tracks:  String(localized: "Tracks")
        case .albums:  String(localized: "Albums")
        case .artists: String(localized: "Artists")
        }
    }

    var icon: String {
        switch self {
        case .all:     "music.note.list"
        case .tracks:  "music.note"
        case .albums:  "square.stack"
        case .artists: "person.circle"
        }
    }

    var mediaType: MediaType? {
        switch self {
        case .all:     nil
        case .tracks:  .track
        case .albums:  .album
        case .artists: .artist
        }
    }

    var emptyPanelTitle: String {
        switch self {
        case .all:     String(localized: "No Conversions")
        case .tracks:  String(localized: "No Tracks")
        case .albums:  String(localized: "No Albums")
        case .artists: String(localized: "No Artists")
        }
    }

    var emptyTitle: String {
        switch self {
        case .all:     String(localized: "No Conversions Yet")
        case .tracks:  String(localized: "No Tracks")
        case .albums:  String(localized: "No Albums")
        case .artists: String(localized: "No Artists")
        }
    }

    var emptyDescription: String {
        switch self {
        case .all:     String(localized: "Share a streaming link to get started.")
        case .tracks:  String(localized: "Resolved tracks will appear here.")
        case .albums:  String(localized: "Resolved albums will appear here.")
        case .artists: String(localized: "Resolved artists will appear here.")
        }
    }

    /// Filters entries by media type and search text.
    func filtered(_ entries: [MediaEntry], searchText: String) -> [MediaEntry] {
        let byType: [MediaEntry]
        if let mediaType {
            byType = entries.filter { $0.mediaType == mediaType }
        } else {
            byType = entries
        }
        guard !searchText.isEmpty else { return byType }
        return byType.filter { entry in
            entry.contentType.title.localizedCaseInsensitiveContains(searchText) ||
            entry.contentType.subtitle.localizedCaseInsensitiveContains(searchText)
        }
    }
}
