import SwiftUI

// MARK: - TrackView

struct TrackView: View {
  var track: TrackInfo
  var shortUrl: String
}

extension TrackView {
  var body: some View {
    HStack(spacing: 10) {
      ArtworkView(url: track.artworkUrl)
      VStack(alignment: .leading, spacing: 3) {
        Text(track.title)
          .font(.body)
          .fontWeight(.medium)
          .lineLimit(1)
        Text(track.artistsString)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 8)
      if let duration = track.formattedDuration {
        Text(duration)
          .font(.subheadline.monospacedDigit())
          .foregroundStyle(.secondary)
      }
      ShareLink(item: shortUrl) {
        Image(systemName: "square.and.arrow.up")
          .font(.body)
          .foregroundStyle(.secondary)
      }
      .accessibilityLabel("Share \(shortUrl)")
      .buttonStyle(.borderless)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }
}

// MARK: - ArtworkView

private struct ArtworkView: View {
  var url: String?
  private static let size: CGFloat = 40
}

extension ArtworkView {
  var body: some View {
    Group {
      if let urlString = url, let artworkURL = URL(string: urlString) {
        AsyncImage(url: artworkURL) { phase in
          switch phase {
          case .success(let image):
            image.resizable().scaledToFill()
          case .failure, .empty:
            placeholder
          @unknown default:
            placeholder
          }
        }
      } else {
        placeholder
      }
    }
    .frame(width: Self.size, height: Self.size)
    .clipShape(.rect(cornerRadius: 5))
  }
}

private extension ArtworkView {
  var placeholder: some View {
    Rectangle()
      .fill(.quaternary)
      .overlay {
        Image(systemName: "music.note")
          .font(.caption)
          .foregroundStyle(.tertiary)
      }
  }
}
