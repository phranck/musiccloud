#if os(iOS)
import os
import SwiftData
import SwiftUI
import UIKit
import UniformTypeIdentifiers

// MARK: - ShareViewController

/// Receives URLs from the iOS Share Sheet, resolves them to musiccloud.io short links,
/// saves to SwiftData (CloudKit synced), and copies the result to the clipboard.
///
/// From the start it hosts the same ``ConversionSheet`` as the iOS app: the
/// animation while the URL converts, then the result with posting to the
/// connected accounts, or the error. The close button ends the extension.
///
/// Every step logs to ``AppLogger/shareExtension``, so a run on a device can be
/// followed in Console.app under the category `ShareExtension`.
final class ShareViewController: UIViewController {
    /// Kept alive so CloudKit has time to sync after saving.
    private var syncContainer: ModelContainer?
    /// Hosts the sheet; its root view is replaced for every phase.
    private var host: UIHostingController<ConversionSheet>?
    /// The phase the sheet shows, which decides how closing ends the extension.
    private var phase: ConversionPhase = .converting

    private let log = AppLogger.shareExtension

    override func viewDidLoad() {
        super.viewDidLoad()
        log.info("viewDidLoad, bounds \(String(describing: self.view.bounds), privacy: .public), \(Self.memoryReport, privacy: .public)")
        view.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.95)
        show(.converting)
        handleSharedItems()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        log.info("viewWillAppear")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        log.info("viewDidAppear, bounds \(String(describing: self.view.bounds), privacy: .public)")
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        log.info("viewWillDisappear, phase \(self.phaseName, privacy: .public)")
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        log.info("viewDidDisappear, phase \(self.phaseName, privacy: .public)")
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        log.error("Memory warning, \(Self.memoryReport, privacy: .public)")
    }

    deinit {
        AppLogger.shareExtension.info("deinit")
    }
}

// MARK: - Diagnostics

private extension ShareViewController {
    /// The current phase as a short name for the log.
    var phaseName: String {
        switch phase {
        case .converting: "converting"
        case .finished: "finished"
        case .failed(let message): "failed(\(message ?? "no message"))"
        }
    }

    /// The memory still available to the extension. The system ends an
    /// extension without a crash report when it runs out, so a falling figure
    /// right before the log stops points there.
    static var memoryReport: String {
        let available = os_proc_available_memory()
        return "available memory \(ByteCountFormatter.string(fromByteCount: Int64(available), countStyle: .memory))"
    }
}

// MARK: - UI

private extension ShareViewController {
    /// Shows `newPhase` in the sheet, hosting the sheet the first time.
    func show(_ newPhase: ConversionPhase) {
        phase = newPhase
        log.info("show \(self.phaseName, privacy: .public)")
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
        log.info("Close tapped, phase \(self.phaseName, privacy: .public)")
        if case .finished = phase {
            complete()
        } else {
            cancel(reason: "closed by the user")
        }
    }
}

// MARK: - URL Extraction

private extension ShareViewController {
    /// Takes the first shared item that reads as a URL or as text and converts it.
    func handleSharedItems() {
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        log.info("extensionContext \(self.extensionContext == nil ? "missing" : "present", privacy: .public), \(items.count) input items, \(providers.count) attachments")
        for (index, provider) in providers.enumerated() {
            log.info("Attachment \(index): types \(provider.registeredTypeIdentifiers.joined(separator: ", "), privacy: .public)")
        }

        Task {
            for (index, provider) in providers.enumerated() {
                if let shared = await sharedText(from: provider, index: index) {
                    processURL(shared.trimmingCharacters(in: .whitespacesAndNewlines))
                    return
                }
            }
            cancel(reason: "no attachment held a URL or text")
        }
    }

    /// Reads a provider as a URL, or as plain text when it holds no URL.
    func sharedText(from provider: NSItemProvider, index: Int) async -> String? {
        let log = log
        if provider.canLoadObject(ofClass: URL.self) {
            log.info("Attachment \(index): loading as URL")
            return await withCheckedContinuation { continuation in
                _ = provider.loadObject(ofClass: URL.self) { url, error in
                    if let error {
                        log.error("Attachment \(index): URL load failed: \(String(describing: error), privacy: .public)")
                    } else {
                        log.info("Attachment \(index): URL \(url?.absoluteString ?? "nil", privacy: .public)")
                    }
                    continuation.resume(returning: url?.absoluteString)
                }
            }
        }
        if provider.canLoadObject(ofClass: String.self) {
            log.info("Attachment \(index): loading as text")
            let text: String? = await withCheckedContinuation { continuation in
                _ = provider.loadObject(ofClass: String.self) { text, error in
                    if let error {
                        log.error("Attachment \(index): text load failed: \(String(describing: error), privacy: .public)")
                    } else {
                        log.info("Attachment \(index): text \(text ?? "nil", privacy: .public)")
                    }
                    continuation.resume(returning: text)
                }
            }
            if let text { return text }
        }
        // Spotify registers `public.plain-text` with data that NSString cannot
        // be instantiated from (NSItemProvider error -1200), so the bytes are
        // read with PlainTextItem.
        if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            log.info("Attachment \(index): loading plain text data")
            return await withCheckedContinuation { continuation in
                _ = provider.loadDataRepresentation(forTypeIdentifier: UTType.plainText.identifier) { data, error in
                    guard let data else {
                        log.error("Attachment \(index): plain text data load failed: \(String(describing: error), privacy: .public)")
                        continuation.resume(returning: nil)
                        return
                    }
                    let head = data.prefix(16).map { String(format: "%02x", $0) }.joined(separator: " ")
                    log.info("Attachment \(index): \(data.count) bytes, starting \(head, privacy: .public)")
                    let text = PlainTextItem.text(from: data)
                    log.info("Attachment \(index): read as \(text ?? "nil", privacy: .public)")
                    continuation.resume(returning: text)
                }
            }
        }
        log.info("Attachment \(index): neither URL nor text")
        return nil
    }
}

// MARK: - Resolve + Persist

private extension ShareViewController {
    @MainActor
    func processURL(_ urlString: String) {
        guard StreamingServices.isStreamingURL(urlString) else {
            log.error("Not a streaming URL: \(urlString, privacy: .public)")
            show(.failed(message: String(localized: "This URL is not from a supported streaming service")))
            return
        }

        Task { @MainActor in
            do {
                // The extension has no local network access, so it always
                // converts against production, also in a debug build.
                log.info("Converting \(urlString, privacy: .public) against \(MusicCloudAPI.productionURL.absoluteString, privacy: .public), \(Self.memoryReport, privacy: .public)")
                let conversion = try await MusicCloudAPI.convert(url: urlString, baseURL: MusicCloudAPI.productionURL)
                log.info("Converted to \(conversion.response.shortUrl, privacy: .public)")
                let entry = conversion.makeEntry(originalUrl: urlString)
                try saveToSwiftData(entry)
                log.info("Saved to SwiftData, \(Self.memoryReport, privacy: .public)")

                Pasteboard.copy(conversion.response.shortUrl)
                HapticFeedback.success()
                show(.finished(entry))
            } catch {
                log.error("Conversion or save failed: \(String(describing: error), privacy: .public)")
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
        log.info("completeRequest")
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// Cancels the request; `reason` says in the log why.
    func cancel(reason: String) {
        log.info("cancelRequest: \(reason, privacy: .public)")
        extensionContext?.cancelRequest(withError: NSError(domain: "io.musiccloud.ShareExtension", code: 0))
    }
}

#endif
