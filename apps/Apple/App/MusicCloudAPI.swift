import Foundation
import OSLog

// MARK: - MusicCloudAPI

enum MusicCloudAPI {
  private static let baseURL = URL(string: "https://musiccloud.io")!
  private static let logger = Logger(subsystem: "io.musiccloud.app", category: "API")
}

// MARK: - Resolve

extension MusicCloudAPI {
  static func resolve(url: String) async throws -> ResolveResponse {
    let endpoint = baseURL.appendingPathComponent("api/resolve")
    var request = URLRequest(url: endpoint)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(["query": url])

    logger.debug("→ POST \(endpoint.absoluteString)")
    logger.debug("  body: {\"query\": \"\(url)\"}")

    let (data, response) = try await URLSession.shared.data(for: request)
    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
    let bodyString = String(data: data, encoding: .utf8) ?? "<non-utf8>"

    logger.debug("← HTTP \(statusCode)")
    logger.debug("  body: \(bodyString)")

    if statusCode == 429 { throw ResolveError.rateLimited }

    guard (200..<300).contains(statusCode) else {
      let error = resolveError(from: data, statusCode: statusCode)
      logger.error("  mapped error: \(String(describing: error))")
      throw error
    }

    do {
      let result = try JSONDecoder().decode(ResolveResponse.self, from: data)
      logger.debug("  shortUrl: \(result.shortUrl)")
      return result
    } catch {
      logger.error("  decode failed: \(error)")
      throw error
    }
  }
}

// MARK: - Error Mapping

private extension MusicCloudAPI {
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
