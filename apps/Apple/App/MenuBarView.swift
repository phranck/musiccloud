import SwiftUI
#if os(macOS)
import AppKit
#endif

// MARK: - MenuBarView

struct MenuBarView: View {
  @Environment(ClipboardMonitor.self) private var monitor
  @Environment(HistoryManager.self) private var historyManager
  
  private var history: [ConversionEntry] {
    historyManager.entries
  }
  
  var body: some View {
    VStack(spacing: 0) {
      HeaderRow(isProcessing: monitor.isProcessing)
      Divider()
      StatusSection(lastError: monitor.lastError, lastEntry: history.first)
      
      if history.count > 1 {
        Divider()
        HistorySection(history: Array(history.dropFirst().prefix(5)))
      }
      
      Divider()
      QuitButton()
    }
    .frame(width: 360)
  }
}

// MARK: - HeaderRow

private struct HeaderRow: View {
  var isProcessing: Bool
  
  var body: some View {
    HStack {
      Image(systemName: "music.note.list")
        .font(.body)
        .foregroundStyle(.tint)
      Text("musiccloud")
        .font(.body.weight(.semibold))
      Spacer()
      if isProcessing {
        ProgressView().scaleEffect(0.8)
      } else {
        Circle()
          .fill(.green)
          .frame(width: 8, height: 8)
          .accessibilityLabel("Monitoring active")
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }
}

// MARK: - StatusSection

private struct StatusSection: View {
  var lastError: String?
  var lastEntry: ConversionEntry?
  
  var body: some View {
    Group {
      if let error = lastError {
        errorRow(error)
      } else if let entry = lastEntry {
        convertedRow(entry: entry)
      } else {
        idleRow
      }
    }
  }
  
  private func errorRow(_ message: String) -> some View {
    HStack(spacing: 8) {
      Image(systemName: "exclamationmark.triangle.fill")
        .font(.body)
        .foregroundStyle(.orange)
      Text(message)
        .font(.body)
        .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
  }
  
  private func convertedRow(entry: ConversionEntry) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Last converted")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.top, 12)
      
      if let track = entry.track {
        TrackView(track: track, shortUrl: entry.shortUrl)
      } else {
        HStack(spacing: 8) {
          Text(entry.shortUrl)
            .font(.body.monospaced())
            .lineLimit(1)
          Spacer()
          ShareLink(item: entry.shortUrl) {
            Image(systemName: "square.and.arrow.up")
              .font(.body)
          }
          .accessibilityLabel("Share \(entry.shortUrl)")
          .buttonStyle(.borderless)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
      }
    }
  }
  
  private var idleRow: some View {
    Text("Monitoring clipboard for streaming URLs…")
      .font(.body)
      .foregroundStyle(.secondary)
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
  }
}

// MARK: - HistorySection

private struct HistorySection: View {
  var history: [ConversionEntry]
  
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("Recent")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
      
      ForEach(history) { entry in
        MenuBarHistoryRow(entry: entry)
      }
    }
  }
}

// MARK: - MenuBarHistoryRow

private struct MenuBarHistoryRow: View {
  var entry: ConversionEntry
  @State private var isHovered = false
  
  private var hostName: String {
    URL(string: entry.originalUrl)?.host ?? entry.originalUrl
  }
  
  var body: some View {
    Group {
      if let track = entry.track {
        Button {
          #if os(macOS)
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(entry.shortUrl, forType: .string)
          #endif
        } label: {
          TrackView(track: track, shortUrl: entry.shortUrl)
        }
        .buttonStyle(.plain)
        .background(isHovered ? Color(nsColor: .selectedContentBackgroundColor) : Color.clear)
        .contentShape(Rectangle())
        .onHover { hovering in
          isHovered = hovering
        }
      } else {
        Button {
          #if os(macOS)
          NSPasteboard.general.clearContents()
          NSPasteboard.general.setString(entry.shortUrl, forType: .string)
          #endif
        } label: {
          HStack {
            VStack(alignment: .leading, spacing: 2) {
              Text(entry.shortUrl)
                .font(.body.monospaced())
                .lineLimit(1)
              Text(hostName)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "square.and.arrow.up")
              .font(.body)
              .foregroundStyle(.secondary)
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .background(isHovered ? Color(nsColor: .selectedContentBackgroundColor) : Color.clear)
        .contentShape(Rectangle())
        .onHover { hovering in
          isHovered = hovering
        }
      }
    }
  }
}

// MARK: - QuitButton

private struct QuitButton: View {
  @State private var isHovered = false
  
  var body: some View {
    Button {
      #if os(macOS)
      NSApplication.shared.terminate(nil)
      #endif
    } label: {
      Label("Quit musiccloud", systemImage: "power")
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .buttonStyle(.plain)
    .foregroundStyle(.secondary)
    .font(.body)
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .background(isHovered ? Color(nsColor: .selectedContentBackgroundColor) : Color.clear)
    .contentShape(Rectangle())
    .onHover { hovering in
      isHovered = hovering
    }
  }
}
