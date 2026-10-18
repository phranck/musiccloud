import SwiftUI

// MARK: - HistoryGridCard

/// A square card for displaying a media entry in a grid layout.
///
/// Full-bleed artwork with the title and subtitle on a system material at
/// the bottom, so the caption takes its colors and contrast from the system
/// in light and dark mode.
struct HistoryGridCard: View {
    let entry: MediaEntry

    var body: some View {
        GridCardArtwork(entry: entry).overlay(alignment: .bottom) { GridCardInfo(entry: entry) }.aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12)).accessibilityElement(children: .combine).accessibilityLabel(
                "\(entry.contentType.title), \(entry.contentType.subtitle)"
            )
    }
}

// MARK: - GridCardArtwork

private struct GridCardArtwork: View {
    let entry: MediaEntry

    var body: some View {
        Color.clear.overlay {
            CachedAsyncImage(entry: entry) { ArtworkPlaceholder(icon: entry.contentType.placeholderIcon, symbolFont: .system(size: 40)) }
        }.clipped()
    }
}

// MARK: - GridCardInfo

private struct GridCardInfo: View {
    let entry: MediaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.contentType.subtitle).font(Self.subtitleFont).foregroundStyle(.primary).lineLimit(1)
            Text(entry.contentType.title).font(Self.titleFont).foregroundStyle(.secondary).lineLimit(1)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(.regularMaterial)
    }

    // On iOS the caption is a step smaller than on the Mac.
    #if os(iOS)
    private static let subtitleFont = Font.subheadline.weight(.semibold)
    private static let titleFont = Font.footnote
    #else
    private static let subtitleFont = Font.headline
    private static let titleFont = Font.subheadline
    #endif
}
