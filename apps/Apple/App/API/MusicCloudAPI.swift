import Foundation
import OSLog

// MARK: - MusicCloudAPI

/// API client for the musiccloud.io URL conversion service.
///
/// `MusicCloudAPI` provides methods to resolve streaming service URLs to universal
/// short links and download associated artwork. All methods are asynchronous and
/// use structured concurrency.
///
/// ## Endpoints
///
/// - **POST /api/resolve**: Converts a streaming URL to a musiccloud.io short link
/// - **GET (artwork URL)**: Downloads artwork images
///
/// ## Usage
///
/// ```swift
/// // Resolve a URL
/// let response = try await MusicCloudAPI.resolve(url: "https://open.spotify.com/track/...")
/// print(response.shortUrl) // "https://musiccloud.io/abc123"
///
/// // Download artwork
/// if let artworkUrl = response.track?.artworkUrl {
///     let imageData = await MusicCloudAPI.downloadArtwork(from: artworkUrl)
/// }
/// ```
///
/// ## Error Handling
///
/// Methods throw ``ResolveError`` on failure, including rate limiting, network errors,
/// and invalid URLs. All errors are logged using ``AppLogger/api``.
///
/// ## Topics
///
/// ### Resolving URLs
/// - ``resolve(url:)``
///
/// ### Downloading Content
/// - ``downloadArtwork(from:)``
enum MusicCloudAPI {
    
    /// Base URL for the musiccloud.io API
    private static let baseURL = URL(string: "https://musiccloud.io")!
}

// MARK: - Resolve

extension MusicCloudAPI {
    
    /// Resolves a streaming service URL to a musiccloud.io short link.
    ///
    /// Sends a POST request to the `/api/resolve` endpoint with the streaming URL.
    /// The API identifies the service, extracts metadata, and returns a universal
    /// short link along with track/album/artist information.
    ///
    /// - Parameter url: The streaming service URL to resolve (Spotify, Apple Music, etc.)
    /// - Returns: A ``ResolveResponse`` containing the short URL and metadata
    /// - Throws: ``ResolveError`` if the request fails
    ///
    /// ## Supported Services
    ///
    /// - Spotify
    /// - Apple Music
    /// - YouTube Music
    /// - Tidal
    /// - Deezer
    /// - And 20+ more streaming platforms
    ///
    /// ## Example
    ///
    /// ```swift
    /// do {
    ///     let response = try await MusicCloudAPI.resolve(url: "https://open.spotify.com/track/...")
    ///     print("Short URL: \(response.shortUrl)")
    ///     if let track = response.track {
    ///         print("Track: \(track.title) by \(track.artistsString)")
    ///     }
    /// } catch ResolveError.rateLimited {
    ///     print("Too many requests - please wait")
    /// } catch {
    ///     print("Error: \(error)")
    /// }
    /// ```
    ///
    /// ## Error Handling
    ///
    /// - **429**: Throws `.rateLimited` - request rate limit exceeded
    /// - **4xx/5xx**: Throws `.httpError(statusCode)` - server error
    /// - **Network**: Throws underlying URLSession errors
    /// - **Invalid JSON**: Throws decoding errors
    ///
    /// - Note: All requests and responses are logged via ``AppLogger/api``
    static func resolve(url: String) async throws -> ResolveResponse {
        let endpoint = baseURL.appendingPathComponent("api/resolve")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["query": url])

        AppLogger.api.debug("→ POST \(endpoint.absoluteString)")
        AppLogger.api.debug("  body: {\"query\": \"\(url)\"}")

        let (data, response) = try await URLSession.shared.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        let bodyString = String(data: data, encoding: .utf8) ?? "<non-utf8>"

        AppLogger.api.debug("← HTTP \(statusCode)")
        AppLogger.api.debug("  body: \(bodyString)")

        if statusCode == 429 { throw ResolveError.rateLimited }

        guard (200..<300).contains(statusCode) else {
            let error = resolveError(from: data, statusCode: statusCode)
            AppLogger.api.error("  mapped error: \(String(describing: error))")
            throw error
        }

        do {
            let result = try JSONDecoder().decode(ResolveResponse.self, from: data)
            AppLogger.api.debug("  shortUrl: \(result.shortUrl)")
            return result
        } catch {
            AppLogger.api.error("  decode failed: \(error)")
            throw error
        }
    }

    /// Downloads artwork image data from a URL.
    ///
    /// Performs a GET request to download the artwork image associated with a track,
    /// album, or artist. The image format is typically JPEG or PNG.
    ///
    /// - Parameter urlString: The URL string pointing to the artwork image
    /// - Returns: Image data on success, or `nil` if download fails
    ///
    /// ## Example
    ///
    /// ```swift
    /// if let artworkUrl = track.artworkUrl {
    ///     if let data = await MusicCloudAPI.downloadArtwork(from: artworkUrl) {
    ///         let image = NSImage(data: data) // macOS
    ///         // or: let image = UIImage(data: data) // iOS
    ///     }
    /// }
    /// ```
    ///
    /// ## Behavior
    ///
    /// - Returns `nil` if the URL is invalid
    /// - Returns `nil` if the HTTP response status is not 2xx
    /// - Returns `nil` if the network request fails
    /// - Logs all operations via ``AppLogger/api``
    ///
    /// - Note: This method does not throw errors - it returns `nil` on failure
    static func downloadArtwork(from urlString: String) async -> Data? {
        guard let url = URL(string: urlString) else {
            AppLogger.api.error("Invalid artwork URL: \(urlString)")
            return nil
        }

        do {
            AppLogger.api.debug("→ Downloading artwork from \(url.absoluteString)")
            let (data, response) = try await URLSession.shared.data(from: url)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode) else {
                AppLogger.api.error("Failed to download artwork: invalid response")
                return nil
            }

            AppLogger.api.debug("← Artwork downloaded successfully (\(data.count) bytes)")
            return data
        } catch {
            AppLogger.api.error("Failed to download artwork: \(error.localizedDescription)")
            return nil
        }
    }
}

// MARK: - Error Mapping

private extension MusicCloudAPI {
    
    /// Maps API error responses to typed ``ResolveError`` cases.
    ///
    /// Attempts to decode an ``APIError`` from the response data. If successful,
    /// maps the error code to a specific ``ResolveError`` case. If decoding fails,
    /// returns a generic HTTP error with the status code.
    ///
    /// - Parameters:
    ///   - data: Response body data from the failed request
    ///   - statusCode: HTTP status code from the response
    /// - Returns: A typed ``ResolveError`` representing the failure
    ///
    /// ## Error Mappings
    ///
    /// - `"INVALID_URL"` → `.invalidURL`
    /// - `"NETWORK_ERROR"` → `.networkError`
    /// - `"SERVICE_DOWN"` → `.serviceDown`
    /// - `"RATE_LIMITED"` → `.rateLimited`
    /// - Unknown codes → `.unknown(message)`
    /// - Decode failure → `.httpError(statusCode)`
    static func resolveError(from data: Data, statusCode: Int) -> ResolveError {
        guard let apiError = try? JSONDecoder().decode(APIError.self, from: data) else {
            return .httpError(statusCode)
        }
        switch apiError.error {
        case "INVALID_URL":   return .invalidURL
        case "NETWORK_ERROR": return .networkError
        case "SERVICE_DOWN":  return .serviceDown
        case "RATE_LIMITED":  return .rateLimited
        default:              return .unknown(apiError.message)
        }
    }
}

