#if os(iOS)
import SwiftUI

// MARK: - ResultCardView

/// Full-width success card shown after a URL has been converted.
struct ResultCardView: View {
    @Environment(\.openURL) private var openURL
    @State private var showServiceSheet = false

    var entry: MediaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Converted!", systemImage: "checkmark.circle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.green)
            HStack(spacing: 12) {
                MediaArtwork(url: entry.contentType.artworkUrl)
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.contentType.title)
                        .font(.body.weight(.medium))
                        .lineLimit(1)
                    Text(entry.contentType.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(entry.shortUrl)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
                Spacer()
            }
            HStack(spacing: 12) {
                Button {
                    UIPasteboard.general.string = entry.shortUrl
                    HapticFeedback.success()
                } label: {
                    Label("Copy Link", systemImage: "doc.on.doc")
                }
                ShareLink(item: entry.shortUrl) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                if !entry.serviceLinks.isEmpty {
                    Button {
                        showServiceSheet = true
                    } label: {
                        Label("Open In", systemImage: "arrow.up.right")
                    }
                }
            }
            .font(.subheadline)
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .sheet(isPresented: $showServiceSheet) {
            OpenInServiceSheet(links: entry.serviceLinks)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Converted: \(entry.contentType.title) by \(entry.contentType.subtitle)")
    }
}

#endif
