#if os(iOS)
import UIKit
import UniformTypeIdentifiers

// MARK: - ShareViewController

/// Receives URLs from the iOS Share Sheet and forwards them to the main app for conversion.
///
/// The extension accepts `public.url` and `public.plain-text` items from other apps
/// (Spotify, Apple Music, etc.), validates them against known streaming services,
/// and hands them off to the main app via a custom URL scheme.
final class ShareViewController: UIViewController {
    private let appGroupID = "group.io.musiccloud"
    private let pendingURLKey = "pendingURL"

    override func viewDidLoad() {
        super.viewDidLoad()
        handleSharedItems()
    }
}

// MARK: - Private API

private extension ShareViewController {
    func handleSharedItems() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            cancel()
            return
        }

        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    loadURL(from: provider)
                    return
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    loadText(from: provider)
                    return
                }
            }
        }

        cancel()
    }

    func loadURL(from provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] item, _ in
            guard let self else { return }
            if let url = item as? URL {
                self.processURL(url.absoluteString)
            } else {
                self.cancel()
            }
        }
    }

    func loadText(from provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] item, _ in
            guard let self else { return }
            if let text = item as? String {
                self.processURL(text.trimmingCharacters(in: .whitespacesAndNewlines))
            } else {
                self.cancel()
            }
        }
    }

    func processURL(_ urlString: String) {
        guard StreamingServices.isStreamingURL(urlString) else {
            cancel()
            return
        }

        // Store in App Group for fallback
        let defaults = UserDefaults(suiteName: appGroupID)
        defaults?.set(urlString, forKey: pendingURLKey)

        // Open main app via custom URL scheme
        guard let encoded = urlString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let appURL = URL(string: "musiccloud://resolve?url=\(encoded)") else {
            cancel()
            return
        }

        openURL(appURL)
    }

    func openURL(_ url: URL) {
        var responder: UIResponder? = self
        while let next = responder?.next {
            if let application = next as? UIApplication {
                application.open(url) { [weak self] _ in
                    self?.complete()
                }
                return
            }
            responder = next
        }
        complete()
    }

    func complete() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "io.musiccloud.ShareExtension", code: 0))
    }
}

#endif
