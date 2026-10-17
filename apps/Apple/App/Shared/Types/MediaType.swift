import Foundation

// MARK: - MediaType

/// Type-safe representation of media content types.
///
/// Replaces raw `"track"`, `"album"`, `"artist"` strings throughout the codebase.
/// The raw values match the API and SwiftData storage format.
enum MediaType: String, Codable {
    case track
    case album
    case artist

    /// The SF Symbol that stands for this type everywhere in the app.
    var icon: String {
        switch self {
        case .track: "music.note"
        case .album: "square.stack"
        case .artist: "person.circle"
        }
    }
}
