//
//  ArtworkView.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A view that displays music artwork with async loading and placeholder.
///
/// Shows a 40×40pt square image loaded asynchronously from a URL,
/// with a music note placeholder when unavailable.
struct ArtworkView: View {
    private static let size: CGFloat = 40

    /// The artwork URL to load
    var url: String?

    var body: some View {
        Group {
            if let urlString = url, let artworkURL = URL(string: urlString) {
                AsyncImage(url: artworkURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure, .empty:
                        PlaceholderImage()
                    @unknown default:
                        PlaceholderImage()
                    }
                }
            } else {
                PlaceholderImage()
            }
        }
        .frame(width: Self.size, height: Self.size)
        .clipShape(.rect(cornerRadius: 5))
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
