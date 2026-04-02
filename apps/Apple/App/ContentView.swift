import SwiftUI

// MARK: - ContentView

struct ContentView: View {
  @Environment(ClipboardMonitor.self) private var monitor
  @Environment(HistoryManager.self) private var historyManager
  
  private var history: [ConversionEntry] {
    historyManager.entries
  }
}

extension ContentView {
  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 24) {
          StatusCard(monitor: monitor)
          if !history.isEmpty {
            HistoryList(history: history)
          }
        }
        .padding()
        .frame(maxWidth: .infinity)
      }
      .navigationTitle("musiccloud")
    }
  }
}

// MARK: - StatusCard

private struct StatusCard: View {
  var monitor: ClipboardMonitor
}

extension StatusCard {
  var body: some View {
    VStack(spacing: 12) {
      if monitor.isProcessing {
        processingView
      } else if let error = monitor.lastError {
        errorView(error)
      } else if let shortUrl = monitor.lastShortUrl {
        successView(shortUrl)
      } else {
        idleView
      }
    }
    .padding(20)
    .frame(maxWidth: .infinity)
    .background(.regularMaterial, in: .rect(cornerRadius: 16))
  }
}

private extension StatusCard {
  var processingView: some View {
    Group {
      ProgressView().scaleEffect(1.4)
      Text("Resolving…").font(.subheadline).foregroundStyle(.secondary)
    }
  }

  func errorView(_ message: String) -> some View {
    Group {
      Image(systemName: "exclamationmark.triangle.fill")
        .font(.system(size: 36))
        .foregroundStyle(.orange)
      Text(message)
        .font(.subheadline)
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
    }
  }

  func successView(_ shortUrl: String) -> some View {
    Group {
      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 36))
        .foregroundStyle(.green)
      Text(shortUrl)
        .font(.subheadline.monospaced())
      ShareLink(item: shortUrl) {
        Text("Share")
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
          .background(.tint, in: .rect(cornerRadius: 10))
          .foregroundStyle(.white)
      }
    }
  }

  var idleView: some View {
    Group {
      Image(systemName: "music.note.list")
        .font(.system(size: 36))
        .foregroundStyle(.tint)
      Text("Monitoring clipboard…")
        .font(.subheadline)
        .foregroundStyle(.secondary)
      Text("Copy a streaming URL to convert it automatically.")
        .font(.caption)
        .multilineTextAlignment(.center)
        .foregroundStyle(.tertiary)
    }
  }
}

// MARK: - HistoryList

private struct HistoryList: View {
  var history: [ConversionEntry]
}

extension HistoryList {
  var body: some View {
    let prefixed = Array(history.prefix(20))
    return VStack(alignment: .leading, spacing: 8) {
      Text("Recent")
        .font(.headline)
        .padding(.horizontal, 4)
      VStack(spacing: 0) {
        ForEach(prefixed) { entry in
          HistoryRow(entry: entry)
          if entry.id != prefixed.last?.id {
            Divider().padding(.leading, 16)
          }
        }
      }
      .background(.regularMaterial, in: .rect(cornerRadius: 16))
    }
  }
}

// MARK: - HistoryRow

private struct HistoryRow: View {
  var entry: ConversionEntry
}

extension HistoryRow {
  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(entry.shortUrl)
          .font(.subheadline.monospaced())
          .lineLimit(1)
        Text(entry.originalUrl)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer()
      ShareLink(item: entry.shortUrl) {
        Image(systemName: "square.and.arrow.up")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .accessibilityLabel("Share \(entry.shortUrl)")
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }
}
