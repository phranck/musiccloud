#if os(iOS)
import SwiftData
import UIKit

// MARK: - ShareViewController

/// Receives URLs from the iOS Share Sheet, resolves them to musiccloud.io short links,
/// saves to SwiftData (CloudKit synced), and copies the result to the clipboard.
final class ShareViewController: UIViewController {
    private var spinner: UIActivityIndicatorView!
    private var statusLabel: UILabel!
    private var iconView: UIImageView!
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

    func showSuccess() {
        spinner.stopAnimating()
        spinner.isHidden = true
        iconView.image = UIImage(systemName: "checkmark.circle.fill")
        iconView.tintColor = .systemGreen
        iconView.isHidden = false
        statusLabel.text = String(localized: "Copied to clipboard!")
        statusLabel.textColor = .label

        Task { [weak self] in
            try? await Task.sleep(for: .seconds(5))
            self?.complete()
        }
    }

    func showError(_ message: String) {
        spinner.stopAnimating()
        spinner.isHidden = true
        iconView.image = UIImage(systemName: "xmark.circle.fill")
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
    /// Extensions can't access local network -- always use production.
    static let productionBaseURL = URL(string: "https://musiccloud.io")!

    @MainActor
    func processURL(_ urlString: String) {
        guard StreamingServices.isStreamingURL(urlString) else {
            showError(String(localized: "This URL is not from a supported streaming service"))
            return
        }

        Task { @MainActor in
            do {
                let result = try await MusicCloudAPI.resolve(url: urlString, baseURL: Self.productionBaseURL)

                let artworkUrlString: String? = switch result.contentType {
                case .track(let info): info.artworkUrl
                case .album(let info): info.artworkUrl
                case .artist(let info): info.artworkUrl
                }
                let artworkData = if let artworkUrl = artworkUrlString {
                    await MusicCloudAPI.downloadArtwork(from: artworkUrl)
                } else {
                    nil as Data?
                }

                let entry = result.toMediaEntry(originalUrl: urlString, artworkData: artworkData)
                try saveToSwiftData(entry)

                UIPasteboard.general.string = result.shortUrl
                HapticFeedback.success()
                showSuccess()
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
