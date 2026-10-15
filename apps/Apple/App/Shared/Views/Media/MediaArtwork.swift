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
            ArtworkPlaceholder()
        }
        .frame(width: size, height: size)
        .clipShape(.rect(cornerRadius: 12))
    }
}

/// What stands in for artwork while it loads or when there is none.
///
/// Every artwork view uses it, so a missing cover looks the same in a list
/// row, in the history grid and in the Share Extension.
struct ArtworkPlaceholder: View {
    /// The SF Symbol in the middle, such as the entry type's placeholder icon.
    var icon: String = "music.note"
    /// The symbol's size, which grows with the space the placeholder fills.
    var symbolFont: Font = .caption

    var body: some View {
        Rectangle()
            .fill(.quaternary)
            .overlay {
                Image(systemName: icon)
                    .font(symbolFont)
                    .foregroundStyle(.tertiary)
            }
    }
}
