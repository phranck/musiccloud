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

    #if os(iOS)
    /// Counts copies from the context menu. The card plays the haptic when it
    /// changes, because the menu is gone by the time the copy has happened.
    @State private var copyCount = 0
    #endif

    func body(content: Content) -> some View {
        #if os(macOS)
        let interactiveContent = content.onTapGesture(count: 2) { openSharePage() }
        #else
        let interactiveContent = content.onTapGesture { openSharePage() }.sensoryFeedback(.impact(weight: .light), trigger: copyCount)
        #endif
        interactiveContent.contextMenu {
            #if os(iOS)
            CopyShareURLButton(shortUrl: entry.shortUrl) { copyCount += 1 }
            ShareLink(item: entry.shortUrl) { Label("Share", systemImage: "square.and.arrow.up") }
            #else
            CopyShareURLButton(shortUrl: entry.shortUrl)
            #endif
            OpenInBrowserButton(shortUrl: entry.shortUrl)
            #if os(macOS)
            ServiceLinksMenu(entry: entry)
            PostEntryButton(entry: entry)
            #endif
            Divider()
            DeleteEntryButton(onDelete: onDelete)
        }
    }
}

// MARK: - Private API

private extension EntryActionsModifier {
    func openSharePage() {
        guard let url = StreamingServices.webURL(entry.shortUrl) else { return }
        openURL(url)
    }
}

// MARK: - CopyShareURLButton

private struct CopyShareURLButton: View {
    let shortUrl: String
    /// Runs after the link is on the clipboard, so the card can confirm the copy.
    var onCopy: () -> Void = {}

    var body: some View {
        Button {
            Pasteboard.copy(shortUrl)
            onCopy()
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
            guard let url = StreamingServices.webURL(shortUrl) else { return }
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

// MARK: - PostEntryButton

#if os(macOS)
/// Opens the composer for the entry. It is only offered once an account is
/// connected, because without one there is nowhere to post to.
private struct PostEntryButton: View {
    let entry: MediaEntry

    var body: some View {
        if let delegate = AppDelegate.shared,
            !delegate.socialAccountStore.mastodonAccounts.isEmpty || !delegate.socialAccountStore.blueskyAccounts.isEmpty
        {
            Button {
                delegate.openComposer(for: entry)
            } label: {
                Label("Post…", systemImage: "paperplane")
            }
        }
    }
}
#endif

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
                        guard let url = StreamingServices.webURL(link.url) else { return }
                        openURL(NativeAppLink.preferredURL(for: url))
                    } label: {
                        Label {
                            Text(link.displayName)
                        } icon: {
                            Image(nsImage: .menuIcon(named: "ServiceIcons/\(link.service)"))
                        }
                    }
                }
            } label: {
                Label("Open In", systemImage: "arrow.up.forward.app")
            }
        }
    }
}
#endif

// MARK: - View Extension

extension View {
    func entryActions(entry: MediaEntry, onDelete: @escaping () -> Void) -> some View {
        modifier(EntryActionsModifier(entry: entry, onDelete: onDelete))
    }
}
