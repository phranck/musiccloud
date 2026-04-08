//
//  MediaArtwork.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A view that displays music artwork with async loading and placeholder.
///
/// Shows a square image loaded asynchronously from a URL,
/// with a music note placeholder when unavailable.
struct MediaArtwork: View {
    /// The artwork URL to load
    var url: String?
    var size: CGFloat = 40

    var body: some View {
        CachedAsyncImage(url: url.flatMap(URL.init(string:))) {
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
