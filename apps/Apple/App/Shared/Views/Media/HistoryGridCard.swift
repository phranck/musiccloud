import SwiftUI

// MARK: - HistoryGridCard

/// A square card for displaying a media entry in a grid layout.
///
/// Full-bleed artwork with title/subtitle overlay at the bottom
/// using a gradient scrim. On macOS, adds hover effects.
struct HistoryGridCard: View {
    let entry: MediaEntry

    #if os(macOS)
    @State private var isHovered = false
    #endif

    var body: some View {
        gridArtwork
            .overlay(alignment: .bottom) { cardInfo }
            .aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            #if os(macOS)
            .shadow(color: .black.opacity(isHovered ? 0.2 : 0.08), radius: isHovered ? 12 : 6, y: isHovered ? 4 : 2)
            .scaleEffect(isHovered ? 1.02 : 1.0)
            .animation(.easeOut(duration: 0.15), value: isHovered)
            .onHover { isHovered = $0 }
            #else
            .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
            #endif
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(entry.contentType.title), \(entry.contentType.subtitle)")
    }
}

// MARK: - Private API

private extension HistoryGridCard {
    @ViewBuilder
    var gridArtwork: some View {
        Group {
            #if os(iOS)
            if let data = entry.artworkImageData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                asyncArtwork
            }
            #else
            asyncArtwork
            #endif
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    var asyncArtwork: some View {
        if let urlString = entry.contentType.artworkUrl, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                default:
                    artworkPlaceholder
                }
            }
        } else {
            artworkPlaceholder
        }
    }

    var artworkPlaceholder: some View {
        Rectangle()
            .fill(.quaternary)
            .overlay {
                Image(systemName: entry.contentType.placeholderIcon)
                    .font(.system(size: 40))
                    .foregroundStyle(.tertiary)
            }
    }

    var cardInfo: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.contentType.subtitle)
                .font(.headline)
                .lineLimit(1)
            Text(entry.contentType.title)
                .font(.subheadline)
                .lineLimit(1)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(
            LinearGradient(
                colors: [.black.opacity(0.85), .clear],
                startPoint: .bottom,
                endPoint: .top
            )
        )
    }
}
