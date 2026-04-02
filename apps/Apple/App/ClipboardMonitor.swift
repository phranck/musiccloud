import SwiftUI
import OSLog
#if os(macOS)
import AppKit
#else
import UIKit
#endif

// MARK: - ClipboardMonitor

@Observable
final class ClipboardMonitor {
  private let logger = Logger(subsystem: "io.musiccloud.app", category: "ClipboardMonitor")
  private let historyManager: HistoryManager

  private(set) var isProcessing = false
  private(set) var lastError: String?
  private(set) var lastShortUrl: String?

  private var lastSeenContent: String?
  private var timer: Timer?

  init(historyManager: HistoryManager) {
    self.historyManager = historyManager
    restoreLastShortUrl()
    startMonitoring()
  }

  deinit {
    timer?.invalidate()
  }
}

// MARK: - Public API

extension ClipboardMonitor {
  @MainActor
  func resolve(url: String) async {
    isProcessing = true
    lastError = nil
    defer { isProcessing = false }

    do {
      let result = try await MusicCloudAPI.resolve(url: url)
      let entry = ConversionEntry(originalUrl: url, shortUrl: result.shortUrl, track: result.track)
      historyManager.add(entry)
      lastShortUrl = result.shortUrl
      setPasteboardString(result.shortUrl)
      lastSeenContent = result.shortUrl
      logger.debug("resolve succeeded → \(result.shortUrl)")
    } catch {
      logger.error("resolve failed: \(error.localizedDescription)")
      lastError = error.localizedDescription
    }
  }
}

// MARK: - Monitoring

private extension ClipboardMonitor {
  func startMonitoring() {
    timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      guard let self else { return }
      Task { @MainActor in await self.checkClipboard() }
    }
    RunLoop.main.add(timer!, forMode: .common)
  }

  @MainActor
  func checkClipboard() async {
    guard let content = pasteboardString() else { return }
    guard content != lastSeenContent else { return }
    lastSeenContent = content
    let isStreaming = StreamingServices.isStreamingURL(content)
    logger.debug("clipboard changed — isStreamingURL: \(isStreaming) — \(content)")
    guard isStreaming else { return }
    await resolve(url: content)
  }

  func restoreLastShortUrl() {
    lastShortUrl = historyManager.mostRecent?.shortUrl
  }
}

// MARK: - Pasteboard

private extension ClipboardMonitor {
  func pasteboardString() -> String? {
    #if os(macOS)
    NSPasteboard.general.string(forType: .string)
    #else
    UIPasteboard.general.string
    #endif
  }

  func setPasteboardString(_ string: String) {
    #if os(macOS)
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(string, forType: .string)
    #else
    UIPasteboard.general.string = string
    #endif
  }
}
