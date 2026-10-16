#if os(iOS)
import SwiftData
import SwiftUI
import UIKit

// MARK: - ShareViewController

/// Receives URLs from the iOS Share Sheet, resolves them to musiccloud.io short links,
/// saves to SwiftData (CloudKit synced), and copies the result to the clipboard.
///
/// After a conversion it stays open with ``ShareResultView``, which offers to
/// post the link to the connected accounts; Done closes it.
final class ShareViewController: UIViewController {
    private var spinner: UIActivityIndicatorView!
    private var statusLabel: UILabel!
    private var iconView: UIImageView!
    private var statusStack: UIStackView!
    /// Kept alive so CloudKit has time to sync after saving.
    private var syncContainer: ModelContainer?

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        handleSharedItems()
    }
}

// MARK: - UI

private extension ShareViewController {
    func setupUI() {
        view.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.95)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        statusStack = stack

        iconView = UIImageView()
        iconView.contentMode = .scaleAspectFit
        iconView.tintColor = .tintColor
        iconView.isHidden = true

        spinner = UIActivityIndicatorView(style: .medium)
        spinner.startAnimating()

        statusLabel = UILabel()
        statusLabel.font = .preferredFont(forTextStyle: .subheadline)
        statusLabel.textColor = .secondaryLabel
        statusLabel.text = String(localized: "Converting...")
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        stack.addArrangedSubview(iconView)
        stack.addArrangedSubview(spinner)
        stack.addArrangedSubview(statusLabel)
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 36),
            iconView.heightAnchor.constraint(equalToConstant: 36),
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
        ])
    }

    /// Replaces the progress with the result screen, which stays until the user closes it.
    func showResult(for entry: MediaEntry) {
        statusStack.isHidden = true
        let accounts = SocialAccount.all(in: SocialConnections.shared.store)
        let result = ShareResultView(entry: entry, accounts: accounts) { [weak self] in
            self?.complete()
        }
        let host = UIHostingController(rootView: result.symbolRenderingMode(.hierarchical))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    func showError(_ message: String) {
        spinner.stopAnimating()
        spinner.isHidden = true
        iconView.image = UIImage(systemName: "xmark.circle.fill",
                                 withConfiguration: UIImage.SymbolConfiguration(hierarchicalColor: .systemRed))
        iconView.tintColor = .systemRed
        iconView.isHidden = false
        statusLabel.text = message
        statusLabel.textColor = .secondaryLabel

        Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            self?.cancel()
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
            showError(String(localized: "This URL is not from a supported streaming service"))
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
                showResult(for: entry)
            } catch {
                showError(ResolveError(error).errorDescription ?? error.localizedDescription)
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
