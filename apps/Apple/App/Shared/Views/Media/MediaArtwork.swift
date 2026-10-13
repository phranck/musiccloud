//
//  MediaArtwork.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A view that displays music artwork with async loading and placeholder.
///
/// Shows the entry's artwork as a square, with a music note placeholder
/// while it loads or when there is none.
struct MediaArtwork: View {
    /// The entry whose artwork is shown
    var entry: MediaEntry
    var size: CGFloat = 40

    var body: some View {
        CachedAsyncImage(entry: entry) {
            PlaceholderImage()
        }
        .frame(width: size, height: size)
        .clipShape(.rect(cornerRadius: 12))
    }
}

private struct PlaceholderImage: View {
    var body: some View {
        Rectangle()
            .fill(.quaternary)
            .overlay {
                Image(systemName: "music.note")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
    }
}
