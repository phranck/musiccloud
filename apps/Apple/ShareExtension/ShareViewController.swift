#if os(iOS)
import SwiftData
import SwiftUI
import UIKit

// MARK: - ShareViewController

/// Receives URLs from the iOS Share Sheet, resolves them to musiccloud.io short links,
/// saves to SwiftData (CloudKit synced), and copies the result to the clipboard.
///
/// From the start it hosts the same ``ConversionSheet`` as the iOS app: the
/// animation while the URL converts, then the result with posting to the
/// connected accounts, or the error. The close button ends the extension.
final class ShareViewController: UIViewController {
    /// Kept alive so CloudKit has time to sync after saving.
    private var syncContainer: ModelContainer?
    /// Hosts the sheet; its root view is replaced for every phase.
    private var host: UIHostingController<ConversionSheet>?
    /// The phase the sheet shows, which decides how closing ends the extension.
    private var phase: ConversionPhase = .converting

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.95)
        show(.converting)
        handleSharedItems()
    }
}

// MARK: - UI

private extension ShareViewController {
    /// Shows `newPhase` in the sheet, hosting the sheet the first time.
    func show(_ newPhase: ConversionPhase) {
        phase = newPhase
        let sheet = ConversionSheet(phase: newPhase) { [weak self] in
            self?.close()
        }
        if let host {
            host.rootView = sheet
            return
        }
        let host = UIHostingController(rootView: sheet)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
        self.host = host
    }

    /// Ends the extension: completed once the link is converted, cancelled before that or after a failure.
    func close() {
        if case .finished = phase {
            complete()
        } else {
            cancel()
        }
    }
}

// MARK: - URL Extraction

private extension ShareViewController {
    /// Takes the first shared item that reads as a URL or as text and converts it.
    func handleSharedItems() {
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let providers = items.flatMap { $0.attachments ?? [] }

        Task {
            for provider in providers {
                if let shared = await sharedText(from: provider) {
                    processURL(shared.trimmingCharacters(in: .whitespacesAndNewlines))
                    return
                }
            }
            cancel()
        }
    }

    /// Reads a provider as a URL, or as plain text when it holds no URL.
    func sharedText(from provider: NSItemProvider) async -> String? {
        if provider.canLoadObject(ofClass: URL.self) {
            return await withCheckedContinuation { continuation in
                _ = provider.loadObject(ofClass: URL.self) { url, _ in
                    continuation.resume(returning: url?.absoluteString)
                }
            }
        }
        if provider.canLoadObject(ofClass: String.self) {
            return await withCheckedContinuation { continuation in
                _ = provider.loadObject(ofClass: String.self) { text, _ in
                    continuation.resume(returning: text)
                }
            }
        }
        return nil
    }
}

// MARK: - Resolve + Persist

private extension ShareViewController {
    @MainActor
    func processURL(_ urlString: String) {
        guard StreamingServices.isStreamingURL(urlString) else {
            show(.failed(message: String(localized: "This URL is not from a supported streaming service")))
            return
        }

        Task { @MainActor in
            do {
                // The extension has no local network access, so it always
                // converts against production, also in a debug build.
                let conversion = try await MusicCloudAPI.convert(url: urlString, baseURL: MusicCloudAPI.productionURL)
                let entry = conversion.makeEntry(originalUrl: urlString)
                try saveToSwiftData(entry)

                Pasteboard.copy(conversion.response.shortUrl)
                HapticFeedback.success()
                show(.finished(entry))
            } catch {
                show(.failed(message: ResolveError(error).errorDescription ?? error.localizedDescription))
            }
        }
    }

    func saveToSwiftData(_ entry: MediaEntry) throws {
        let container = try SharedStoreConfiguration.makeContainer()
        syncContainer = container
        let context = ModelContext(container)
        context.insert(entry)
        try context.save()
    }
}

// MARK: - Extension Lifecycle

private extension ShareViewController {
    func complete() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "io.musiccloud.ShareExtension", code: 0))
    }
}

#endif
