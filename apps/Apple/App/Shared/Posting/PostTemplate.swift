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

    init(id: UUID = UUID(), name: String, body: String) {
        self.id = id
        self.name = name
        self.body = body
    }
}
