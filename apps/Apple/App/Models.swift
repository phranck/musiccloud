import Foundation

// MARK: - ConversionEntry

struct ConversionEntry: Codable, Identifiable, Equatable {
  let id: UUID
  var originalUrl: String
  var shortUrl: String
  var track: TrackInfo?
  var date: Date

  init(id: UUID = UUID(), originalUrl: String, shortUrl: String, track: TrackInfo? = nil, date: Date = .now) {
    self.id = id
    self.originalUrl = originalUrl
    self.shortUrl = shortUrl
    self.track = track
    self.date = date
  }
}

// MARK: - TrackInfo

struct TrackInfo: Codable, Equatable {
  var title: String
  var artists: [String]
  var albumName: String?
  var artworkUrl: String?
  var durationMs: Int?
}

extension TrackInfo {
  var artistsString: String {
    artists.joined(separator: ", ")
  }

  var formattedDuration: String? {
    guard let ms = durationMs else { return nil }
    let total = ms / 1000
    return String(format: "%d:%02d", total / 60, total % 60)
  }
}

// MARK: - API Decodable Types

struct ResolveResponse: Decodable {
  var shortUrl: String
  var track: TrackInfo?
}

struct APIError: Decodable {
  var error: String
  var message: String
}

// MARK: - ResolveError

enum ResolveError: LocalizedError {
  case rateLimited
  case invalidURL
  case networkError
  case serviceDown
  case httpError(Int)
  case unknown(String)
}

extension ResolveError {
  var errorDescription: String? {
    switch self {
    case .rateLimited:       String(localized: "error.rate_limited")
    case .invalidURL:        String(localized: "error.invalid_url")
    case .networkError:      String(localized: "error.network")
    case .serviceDown:       String(localized: "error.service_down")
    case .httpError(let c):  "\(String(localized: "error.server")) (\(c))"
    case .unknown(let msg):  msg
    }
  }
}
