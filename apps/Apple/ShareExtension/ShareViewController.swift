#if os(iOS)
import SwiftData
import UIKit
import UniformTypeIdentifiers

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
        statusLabel.text = "Converting..."
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
        statusLabel.text = "Copied to clipboard!"
        statusLabel.textColor = .label

        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
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

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
            self?.cancel()
        }
    }
}

// MARK: - URL Extraction

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
            DispatchQueue.main.async {
                if let url = item as? URL {
                    self.processURL(url.absoluteString)
                } else {
                    self.cancel()
                }
            }
        }
    }

    func loadText(from provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] item, _ in
            guard let self else { return }
            DispatchQueue.main.async {
                if let text = item as? String {
                    self.processURL(text.trimmingCharacters(in: .whitespacesAndNewlines))
                } else {
                    self.cancel()
                }
            }
        }
    }
}

// MARK: - Resolve + Persist

private extension ShareViewController {
    /// Extensions can't access local network -- always use production.
    static let productionBaseURL = URL(string: "https://musiccloud.io")!

    @MainActor
    func processURL(_ urlString: String) {
        guard StreamingServices.isStreamingURL(urlString) else {
            showError("Not a streaming URL")
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
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                showSuccess()
            } catch {
                showError("\(error)")
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
