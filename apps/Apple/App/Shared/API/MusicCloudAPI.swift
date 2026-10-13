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
/// if case .track(let info) = response.contentType, let artworkUrl = info.artworkUrl {
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

    /// Base URL for the musiccloud.io API and short links.
    ///
    /// Override in DEBUG builds via the `MUSICCLOUD_BASE_URL` environment variable
    /// (e.g. set in Xcode scheme). Falls back to `http://localhost:3000`.
    #if DEBUG
    static let baseURL: URL = {
        if let envURL = ProcessInfo.processInfo.environment["MUSICCLOUD_BASE_URL"],
           let url = URL(string: envURL) {
            return url
        }
        return URL(string: "http://localhost:3000")!
    }()
    #else
    // swiftlint:disable:next force_unwrapping
    static let baseURL = URL(string: "https://musiccloud.io")!
    #endif
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
    ///     if case .track(let info) = response.contentType {
    ///         print("Track: \(info.title) by \(info.artistsString)")
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
    /// - Note: Requests and response status codes are logged via ``AppLogger/api``
    static func resolve(url: String, baseURL: URL? = nil) async throws -> ResolveResponse {
        let base = baseURL ?? Self.baseURL
        let endpoint = base.appendingPathComponent("api/resolve")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["query": url])

        AppLogger.api.debug("→ POST \(endpoint.absoluteString)")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            AppLogger.api.error("  transport failed: \(error.localizedDescription)")
            Task.detached {
                await TelemetryClient.shared.report(
                    .networkError(
                        sourceUrl: url,
                        errorKind: "NETWORK_FAILURE",
                        message: error.localizedDescription
                    )
                )
            }
            throw error
        }

        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        let bodyString = String(data: data, encoding: .utf8) ?? "<non-utf8>"

        // The body names what the user converted, so only its size is logged.
        AppLogger.api.debug("← HTTP \(statusCode), \(data.count) bytes")

        if statusCode == 429 {
            reportResolveError(url: url, kind: "RATE_LIMITED", status: statusCode, body: bodyString)
            throw ResolveError.rateLimited
        }

        guard (200..<300).contains(statusCode) else {
            let error = resolveError(from: data, statusCode: statusCode)
            AppLogger.api.error("  mapped error: \(String(describing: error))")
            reportResolveError(url: url, kind: Self.errorKind(for: error), status: statusCode, body: bodyString)
            throw error
        }

        let decoded: ResolveResponse
        do {
            decoded = try JSONDecoder().decode(ResolveResponse.self, from: data)
        } catch {
            AppLogger.api.error("  decode failed: \(error)")
            Task.detached {
                await TelemetryClient.shared.report(
                    .resolveError(
                        sourceUrl: url,
                        errorKind: "DECODE_FAILED",
                        httpStatus: statusCode,
                        message: error.localizedDescription
                    )
                )
            }
            throw error
        }

        do {
            let result = try decoded.pointing(at: base)
            AppLogger.api.debug("  shortUrl: \(result.shortUrl)")
            return result
        } catch {
            reportResolveError(url: url, kind: "INVALID_RESPONSE", status: statusCode, body: "")
            throw error
        }
    }

    /// Short machine-readable code for the telemetry payload's
    /// `errorKind`. Keep the set small so server-side filters stay simple.
    private static func errorKind(for error: ResolveError) -> String {
        switch error {
        case .rateLimited:   return "RATE_LIMITED"
        case .invalidURL:    return "INVALID_URL"
        case .networkError:  return "NETWORK_ERROR"
        case .serviceDown:   return "SERVICE_DOWN"
        case .httpError:     return "HTTP_ERROR"
        case .invalidResponse: return "INVALID_RESPONSE"
        case .unknown:       return "UNKNOWN"
        }
    }

    private static func reportResolveError(url: String, kind: String, status: Int, body: String) {
        let trimmed = body.count > 500 ? String(body.prefix(500)) : body
        Task.detached {
            await TelemetryClient.shared.report(
                .resolveError(
                    sourceUrl: url,
                    errorKind: kind,
                    httpStatus: status,
                    message: trimmed
                )
            )
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
    ///
    /// The address comes from the backend, which takes it from a provider's
    /// answer. So only `http` and `https` are fetched, only an `image/*` answer
    /// is kept, and the body is read up to ``maximumArtworkBytes``. The Share
    /// Extension runs under a tight memory limit and would be killed by an
    /// oversized answer, and whatever is kept here is synced to iCloud.
    static func downloadArtwork(from urlString: String) async -> Data? {
        guard let url = StreamingServices.webURL(urlString) else {
            AppLogger.api.error("Refused artwork address that is not a web URL")
            return nil
        }

        do {
            AppLogger.api.debug("→ Downloading artwork from \(url.absoluteString)")
            var request = URLRequest(url: url)
            request.timeoutInterval = 10
            let (bytes, response) = try await URLSession.shared.bytes(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200..<300).contains(httpResponse.statusCode),
                  httpResponse.mimeType?.lowercased().hasPrefix("image/") == true,
                  httpResponse.expectedContentLength <= Int64(maximumArtworkBytes) else {
                AppLogger.api.error("Failed to download artwork: unacceptable response")
                return nil
            }

            var data = Data()
            if httpResponse.expectedContentLength > 0 {
                data.reserveCapacity(Int(httpResponse.expectedContentLength))
            }
            for try await byte in bytes {
                guard data.count < maximumArtworkBytes else {
                    AppLogger.api.error("Failed to download artwork: larger than \(maximumArtworkBytes) bytes")
                    return nil
                }
                data.append(byte)
            }

            AppLogger.api.debug("← Artwork downloaded successfully (\(data.count) bytes)")
            return data
        } catch {
            AppLogger.api.error("Failed to download artwork: \(error.localizedDescription)")
            return nil
        }
    }

    /// The largest artwork body kept, in bytes. Provider artwork is at most
    /// a few hundred kilobytes at the 1000 px the backend asks for.
    static let maximumArtworkBytes = 5 * 1024 * 1024
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
        let apiError: APIError
        do {
            apiError = try JSONDecoder().decode(APIError.self, from: data)
        } catch {
            AppLogger.api.debug("Failed to decode API error response: \(error)")
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
