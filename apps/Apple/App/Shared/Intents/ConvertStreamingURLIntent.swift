import AppIntents
import Foundation

// MARK: - ConvertStreamingURLIntent

/// Shortcuts/Siri intent that converts a streaming service URL to a universal musiccloud.io link.
struct ConvertStreamingURLIntent: AppIntent {
    static var title: LocalizedStringResource = "Convert Streaming URL"
    static var description: IntentDescription = "Converts a Spotify, Apple Music, or other streaming URL to a universal musiccloud.io link"

    @Parameter(title: "URL")
    var url: URL

    static var parameterSummary: some ParameterSummary {
        Summary("Convert \(\.$url)")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let urlString = url.absoluteString

        guard StreamingServices.isStreamingURL(urlString) else {
            throw ConvertStreamingURLError.invalidURL
        }

        do {
            let response = try await MusicCloudAPI.resolve(url: urlString)
            return .result(value: response.shortUrl)
        } catch {
            throw ConvertStreamingURLError.conversionFailed(error.localizedDescription)
        }
    }
}

// MARK: - ConvertStreamingURLError

enum ConvertStreamingURLError: Swift.Error, CustomLocalizedStringResourceConvertible {
    case invalidURL
    case conversionFailed(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .invalidURL:
            "This URL is not from a supported streaming service"
        case .conversionFailed(let message):
            "Conversion failed: \(message)"
        }
    }
}
