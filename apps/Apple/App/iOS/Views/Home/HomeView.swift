#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - HomeView

/// The main screen of the iOS app showing paste CTA, active conversion state, and recent history.
struct HomeView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Query(sort: \MediaEntry.date, order: .reverse, animation: .default)
    private var entries: [MediaEntry]
    @State private var lastResolvedUrl: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                PasteCTAView()
                statusContent
                recentSection
            }
            .padding()
            .animation(.spring(duration: 0.4), value: monitor.status)
        }
        .navigationTitle(Bundle.main.appName)
    }
}

// MARK: - Private API

private extension HomeView {
    @ViewBuilder
    var statusContent: some View {
        switch monitor.status {
        case .processing(let url):
            processingCard(url: url)
                .transition(.move(edge: .top).combined(with: .opacity))
        case .success(let shortUrl):
            if let entry = entries.first(where: { $0.shortUrl == shortUrl }) {
                ResultCardView(entry: entry)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        case .error(let message):
            errorCard(message: message)
                .transition(.move(edge: .top).combined(with: .opacity))
        case .idle:
            EmptyView()
        }
    }

    var recentSection: some View {
        Group {
            if !entries.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Recent")
                        .font(.headline)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                        ForEach(entries.prefix(6)) { entry in
                            HistoryGridCard(entry: entry)
                        }
                    }
                }
            }
        }
    }

    func processingCard(url: String) -> some View {
        HStack(spacing: 12) {
            ProgressView()
            VStack(alignment: .leading, spacing: 2) {
                Text("Converting...")
                    .font(.subheadline.weight(.medium))
                Text(url)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Converting URL")
    }

    func errorCard(message: String) -> some View {
        let isRateLimit = message.lowercased().contains("rate") || message.lowercased().contains("429")
        return HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            VStack(alignment: .leading, spacing: 2) {
                Text(isRateLimit ? "Too many requests" : "Couldn't convert this URL")
                    .font(.subheadline.weight(.medium))
                Text(isRateLimit ? "Try again in a moment" : message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                monitor.status = .idle
            } label: {
                Text("Dismiss")
                    .font(.caption.weight(.medium))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
        }
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isRateLimit ? "Rate limit error" : "Conversion error: \(message)")
    }
}

#endif
