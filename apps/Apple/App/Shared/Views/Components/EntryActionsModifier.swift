import SwiftUI
#if os(macOS)
import AppKit
#endif

// MARK: - EntryActionsModifier

/// Shared tap and context menu actions for media entry grid cards.
///
/// Provides platform-appropriate interactions:
/// - **iOS**: Single tap opens share page, context menu with copy/share/open/delete
/// - **macOS**: Double-click opens share page, context menu with copy/open/service links/delete
struct EntryActionsModifier: ViewModifier {
    let entry: MediaEntry
    let onDelete: () -> Void

    @Environment(\.openURL) private var openURL

    func body(content: Content) -> some View {
        content
            #if os(macOS)
            .onTapGesture(count: 2) { openSharePage() }
            #else
            .onTapGesture { openSharePage() }
            #endif
            .contextMenu {
                CopyShareURLButton(shortUrl: entry.shortUrl)
                #if os(iOS)
                ShareLink(item: entry.shortUrl) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
                #endif
                OpenInBrowserButton(shortUrl: entry.shortUrl)
                #if os(macOS)
                ServiceLinksMenu(entry: entry)
                #endif
                Divider()
                DeleteEntryButton(onDelete: onDelete)
            }
    }
}

// MARK: - Private API

private extension EntryActionsModifier {
    func openSharePage() {
        guard let url = URL(string: entry.shortUrl) else { return }
        openURL(url)
    }
}

// MARK: - CopyShareURLButton

private struct CopyShareURLButton: View {
    let shortUrl: String

    var body: some View {
        Button {
            #if os(macOS)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(shortUrl, forType: .string)
            #else
            UIPasteboard.general.string = shortUrl
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            #endif
        } label: {
            Label("Copy Share URL", systemImage: "doc.on.doc")
        }
    }
}

// MARK: - OpenInBrowserButton

private struct OpenInBrowserButton: View {
    let shortUrl: String

    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            guard let url = URL(string: shortUrl) else { return }
            openURL(url)
        } label: {
            Label("Open in Browser...", systemImage: "safari")
        }
    }
}

// MARK: - DeleteEntryButton

private struct DeleteEntryButton: View {
    let onDelete: () -> Void

    var body: some View {
        Button(role: .destructive) {
            onDelete()
        } label: {
            Label("Delete Entry", systemImage: "trash")
        }
    }
}

// MARK: - ServiceLinksMenu

#if os(macOS)
private struct ServiceLinksMenu: View {
    let entry: MediaEntry

    @Environment(\.openURL) private var openURL

    var body: some View {
        if entry.mediaType != .artist, !entry.serviceLinks.isEmpty {
            Menu {
                ForEach(entry.serviceLinks, id: \.service) { link in
                    Button {
                        guard let url = URL(string: link.url) else { return }
                        openURL(url)
                    } label: {
                        Label {
                            Text(link.displayName)
                        } icon: {
                            Image(nsImage: Self.serviceIcon(for: link.service))
                        }
                    }
                }
            } label: {
                Label("Open in", systemImage: "arrow.up.forward.app")
            }
        }
    }

    static func serviceIcon(for service: String) -> NSImage {
        let canvasSize = NSSize(width: 16, height: 16)
        guard let original = NSImage(named: "ServiceIcons/\(service)") else {
            return NSImage(systemSymbolName: "music.note", accessibilityDescription: service) ?? NSImage()
        }
        let originalSize = original.size
        let scale = min(canvasSize.width / originalSize.width, canvasSize.height / originalSize.height)
        let scaledSize = NSSize(width: originalSize.width * scale, height: originalSize.height * scale)
        let origin = NSPoint(
            x: (canvasSize.width - scaledSize.width) / 2,
            y: (canvasSize.height - scaledSize.height) / 2
        )
        let resized = NSImage(size: canvasSize, flipped: false) { _ in
            original.draw(in: NSRect(origin: origin, size: scaledSize))
            return true
        }
        resized.isTemplate = true
        return resized
    }
}
#endif

// MARK: - View Extension

extension View {
    func entryActions(entry: MediaEntry, onDelete: @escaping () -> Void) -> some View {
        modifier(EntryActionsModifier(entry: entry, onDelete: onDelete))
    }
}
