//
//  TrackView.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

// MARK: - ContentItemView


// MARK: - TrackContentView


// MARK: - AlbumContentView


// MARK: - ArtistContentView


// MARK: - View Extension for Conditional Modifier


// MARK: - ArtworkView


// MARK: - Legacy TrackView (for backward compatibility)

/// Legacy view for displaying tracks.
///
/// Wraps ``ContentItemView`` for backward compatibility with existing code.
/// New code should use ``ContentItemView`` directly.
///
/// ## Deprecation
///
/// This view exists for compatibility. Prefer using ``ContentItemView`` in new code.
struct TrackView: View {
    /// The track metadata to display
    var track: TrackInfo
    /// The short URL to share
    var shortUrl: String
    /// Whether to show the share button
    var showShareButton: Bool = true
    /// Whether to include padding around the content
    var includePadding: Bool = true

    var body: some View {
        ContentItemView(
            entry: ConversionEntry(
                originalUrl: "",
                shortUrl: shortUrl,
                contentType: .track,
                track: track
            ),
            showShareButton: showShareButton,
            includePadding: includePadding
        )
    }
}

