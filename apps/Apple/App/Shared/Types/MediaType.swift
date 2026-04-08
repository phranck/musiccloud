import Foundation

// MARK: - MediaType

/// Type-safe representation of media content types.
///
/// Replaces raw `"track"`, `"album"`, `"artist"` strings throughout the codebase.
/// The raw values match the API and SwiftData storage format.
enum MediaType: String {
    case track
    case album
    case artist
}
