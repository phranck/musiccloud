#if os(iOS)
import SwiftUI
import SwiftData

// MARK: - HomeView

/// The main screen of the iOS app showing paste CTA, active conversion state, and recent history.
struct HomeView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Environment(\.openURL) private var openURL
    @Query(sort: \MediaEntry.date, order: .reverse, animation: .default)
    private var entries: [MediaEntry]
    @State private var lastResolvedUrl: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                PasteCTAView()
                StatusContent(monitor: monitor, entries: entries)
                RecentSection(entries: entries, openURL: openURL)
            }
            .padding()
            .animation(.spring(duration: 0.4), value: monitor.status)
        }
        .navigationTitle(Bundle.main.appName)
    }
}

// MARK: - StatusContent

private struct StatusContent: View {
    let monitor: ClipboardMonitor
    let entries: [MediaEntry]

    var body: some View {
        switch monitor.status {
        case .processing(let url):
            ProcessingCard(url: url)
                .transition(.move(edge: .top).combined(with: .opacity))
        case .success(let shortUrl, _):
            if let entry = entries.first(where: { $0.shortUrl == shortUrl }) {
                ResultCardView(entry: entry)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        case .error(let message):
            ErrorCard(message: message, monitor: monitor)
                .transition(.move(edge: .top).combined(with: .opacity))
        case .idle:
            EmptyView()
        }
    }
}

// MARK: - RecentSection

private struct RecentSection: View {
    let entries: [MediaEntry]
    let openURL: OpenURLAction

    var body: some View {
        if !entries.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("Recent")
                    .font(.headline)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 16)], spacing: 16) {
                    ForEach(entries.prefix(6)) { entry in
                        HistoryGridCard(entry: entry)
                            .contentShape(RoundedRectangle(cornerRadius: 12))
                            .onTapGesture {
                                guard let url = URL(string: entry.shortUrl) else { return }
                                openURL(url)
                            }
                    }
                }
            }
        }
    }
}

// MARK: - ProcessingCard

private struct ProcessingCard: View {
    let url: String

    var body: some View {
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
}

// MARK: - ErrorCard

private struct ErrorCard: View {
    let message: String
    let monitor: ClipboardMonitor

    private var isRateLimit: Bool {
        message.lowercased().contains("rate") || message.lowercased().contains("429")
    }

    var body: some View {
        HStack(spacing: 12) {
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
