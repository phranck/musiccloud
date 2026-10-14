//
//  PostTemplate.swift
//  musiccloud
//

import Foundation

// MARK: - PostTemplate

/// A reusable text for posting a conversion to a social network.
///
/// The body is Markdown with variables such as `{song_name}`, which
/// ``PostTemplateRenderer`` fills from a history entry.
struct PostTemplate: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    /// The name shown in the template list and in the composer.
    var name: String
    /// The Markdown text with `{variable}` placeholders.
    var body: String
    /// The icon shown beside the name, or `nil` for none.
    var icon: PostTemplateIcon?

    init(id: UUID = UUID(), name: String, body: String, icon: PostTemplateIcon? = nil) {
        self.id = id
        self.name = name
        self.body = body
        self.icon = icon
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, body, icon
    }

    /// Reads a stored template. A template stored without an icon, or with
    /// an icon this version does not know, loads without one rather than
    /// making the whole file unreadable.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        body = try container.decode(String.self, forKey: .body)
        icon = try? container.decodeIfPresent(PostTemplateIcon.self, forKey: .icon)
    }
}

extension PostTemplate {
    /// The templates that ship with the app. Each needs a fixed id, so the
    /// app recognizes it as a system template across launches.
    static let system: [PostTemplate] = []
}
