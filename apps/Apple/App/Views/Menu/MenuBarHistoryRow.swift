//
//  MenuBarHistoryRow.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI
import OSLog

/// A menu bar row displaying a conversion entry with content-specific layouts.
///
/// `MenuBarHistoryRow` adapts its appearance based on the content type (track, album, or artist),
/// showing appropriate metadata, artwork, and actions. Includes hover effects and tap-to-open functionality.
///
/// ## Content Types
///
/// - **Track**: Shows artwork, title, artists, and duration
/// - **Album**: Shows artwork, name, artists, and track count
/// - **Artist**: Shows artwork, name, genres, and follower count
/// - **Fallback**: Shows short URL and original host for incomplete data
///
/// ## Interactions
///
/// - **Hover**: Highlights with accent color background
/// - **Tap**: Copies short URL to clipboard and opens in browser (macOS only)
/// - **Share Button**: System share sheet for the short URL
///
/// ## Usage
///
/// ```swift
/// ForEach(history) { entry in
///     MenuBarHistoryRow(entry: entry)
/// }
/// ```
///
/// ## Topics
///
/// ### Properties
/// - ``entry``
struct MenuBarHistoryRow: View {
    @State private var isHovered = false

    var entry: MediaInfo

    var body: some View {
        Group {
            switch entry.contentType {
            case .track:
                if let track = entry.track {
                    trackRow(track: track)
                } else {
                    fallbackRow()
                }
            case .album:
                if let album = entry.album {
                    albumRow(album: album)
                } else {
                    fallbackRow()
                }
            case .artist:
                if let artist = entry.artist {
                    artistRow(artist: artist)
                } else {
                    fallbackRow()
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isHovered ? Color.accentColor : Color.clear)
                .padding(.horizontal, 4)
        )
        .foregroundStyle(isHovered ? Color.white : Color.primary)
        .contentShape(Rectangle())
        .onTapGesture {
            copyToClipboardAndOpen()
        }
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

// MARK: - Computed Properties

private extension MenuBarHistoryRow {
    /// Extracts the hostname from the original URL.
    var hostName: String {
        URL(string: entry.originalUrl)?.host ?? entry.originalUrl
    }
}

// MARK: - Row Views

private extension MenuBarHistoryRow {
    /// Track row layout with artwork, title, artists, and duration.
    @ViewBuilder
    func trackRow(track: TrackInfo) -> some View {
        HStack(spacing: 12) {
            ArtworkView(url: track.artworkUrl)
            VStack(alignment: .leading, spacing: 2) {
                Text(track.title)
                    .font(.system(size: 14))
                    .lineLimit(1)
                Text(track.artistsString)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let duration = track.formattedDuration {
                Text(duration)
                    .font(.system(size: 12).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            shareButton()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
    }

    /// Album row layout with artwork, name, artists, and track count.
    @ViewBuilder
    func albumRow(album: AlbumInfo) -> some View {
        HStack(spacing: 12) {
            ArtworkView(url: album.artworkUrl)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "square.stack")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Text(album.name)
                        .font(.system(size: 14))
                }
                .lineLimit(1)
                Text(album.artistsString)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let totalTracks = album.totalTracks {
                Text("\(totalTracks) tracks")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            shareButton()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
    }

    /// Artist row layout with artwork, name, genres, and follower count.
    @ViewBuilder
    func artistRow(artist: ArtistInfo) -> some View {
        HStack(spacing: 12) {
            ArtworkView(url: artist.artworkUrl)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "person.circle")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Text(artist.name)
                        .font(.system(size: 14))
                }
                .lineLimit(1)
                if let genres = artist.genresString {
                    Text(genres)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let followers = artist.formattedFollowers {
                Text(followers)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            shareButton()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
    }

    /// Fallback row when metadata is unavailable.
    @ViewBuilder
    func fallbackRow() -> some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.shortUrl)
                    .font(.system(size: 14))
                    .lineLimit(1)
                Text(hostName)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            shareButton()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
    }

    /// Share button that adapts color based on hover state.
    @ViewBuilder
    func shareButton() -> some View {
        ShareLink(item: entry.shortUrl) {
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 14))
                .foregroundStyle(isHovered ? .white : .secondary)
        }
        .buttonStyle(.borderless)
        .help("Share \(entry.shortUrl)")
    }

    /// Artwork view with async image loading and placeholder.
    @ViewBuilder
    func ArtworkView(url: String?) -> some View {
        Group {
            if let urlString = url, let artworkURL = URL(string: urlString) {
                AsyncImage(url: artworkURL) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    case .failure, .empty:
                        artworkPlaceholder
                    @unknown default:
                        artworkPlaceholder
                    }
                }
            } else {
                artworkPlaceholder
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(.rect(cornerRadius: 4))
    }

    /// Placeholder shown when artwork is unavailable.
    var artworkPlaceholder: some View {
        Rectangle()
            .fill(.quaternary)
            .overlay {
                Image(systemName: "music.note")
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
            }
    }

    /// Copies the short URL to clipboard and opens it in the browser (macOS only).
    func copyToClipboardAndOpen() {
#if os(macOS)
        // 1. Copy to clipboard
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(entry.shortUrl, forType: .string)

        // 2. Open in browser
        if let url = URL(string: entry.shortUrl) {
            NSWorkspace.shared.open(url)
        }
#endif
    }
}
