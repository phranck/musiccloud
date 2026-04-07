#if os(iOS)
import SwiftUI

// MARK: - HistoryGridCard

/// A compact card for displaying a media entry in a grid layout.
struct HistoryGridCard: View {
    var entry: MediaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            artwork
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Private API

private extension HistoryGridCard {
    @ViewBuilder
    var artwork: some View {
        if let data = entry.artworkImageData, let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .frame(height: 100)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            RoundedRectangle(cornerRadius: 8)
                .fill(.quaternary)
                .frame(height: 100)
                .overlay {
                    Image(systemName: "music.note")
                        .font(.title3)
                        .foregroundStyle(.tertiary)
                }
        }
    }

    var title: String {
        switch entry.contentType {
        case .track(let info): info.title
        case .album(let info): info.title
        case .artist(let info): info.name
        }
    }

    var subtitle: String {
        switch entry.contentType {
        case .track(let info): info.artistsString
        case .album(let info): info.artistsString
        case .artist(let info): info.genresString ?? ""
        }
    }
}

#endif
