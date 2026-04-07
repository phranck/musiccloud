#if os(iOS)
import SwiftUI

// MARK: - PasteCTAView

/// Hero card prompting users to share or paste a streaming URL.
struct PasteCTAView: View {
    @Environment(ClipboardMonitor.self) private var monitor

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "music.note.list")
                .font(.system(size: 40))
                .foregroundStyle(.tint)
            Text("Share a link from Spotify, Apple Music, or any streaming service")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            PasteButton(payloadType: String.self) { strings in
                guard let urlString = strings.first else { return }
                let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
                guard StreamingServices.isStreamingURL(trimmed) else { return }
                Task { await monitor.resolve(url: trimmed) }
            }
            .buttonBorderShape(.capsule)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Paste a streaming URL to convert")
    }
}

#endif
