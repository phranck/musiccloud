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

    private enum CodingKeys: String, CodingKey { case id, name, body, icon }

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
    /// app recognizes it as a system template across launches, and so an
    /// automatic posting rule that names one keeps finding it.
    static let system: [PostTemplate] = [
        PostTemplate(
            id: UUID(uuidString: "FDAD39C2-4220-4D95-9A60-704C77766E32")!,
            name: "Mastodon",
            body: nowPlayingBody(hashtags: "#Music #MusicCloud #NowPlaying #NowListening"),
            icon: .mastodon
        ),
        PostTemplate(
            id: UUID(uuidString: "1BCEECEB-A43A-4549-99CA-0609C92BE4A8")!,
            name: "Bluesky",
            body: nowPlayingBody(hashtags: "#Music #MusicCloud #NowPlaying"),
            icon: .bluesky
        ),
    ]

    /// The system template written for the service of `account`, matched by
    /// the service's logo, which the Share Extension posts with.
    static func systemTemplate(for account: SocialAccount) -> PostTemplate? { system.first { $0.icon == account.icon } }

    /// The template `account` posts with unless the user picks another one
    /// for a single post.
    ///
    /// The composer, the Share Extension and automatic posting all ask this,
    /// so every path starts from the same text. The chosen template wins
    /// while it is still among `templates`. Without a choice, or once the
    /// chosen template is deleted, the account falls back to the system
    /// template of its service, so it never ends up without a default.
    ///
    /// - Parameters:
    ///   - account: The account a post goes to.
    ///   - chosenID: The template the user made this account's default, or `nil` for none.
    ///   - templates: The templates that exist now; iOS has no templates of the user's own and passes none.
    /// - Returns: The default template, or `nil` only for a service without a system template.
    static func defaultTemplate(
        for account: SocialAccount,
        chosenID: PostTemplate.ID? = nil,
        among templates: [PostTemplate] = []
    ) -> PostTemplate? { templates.first { $0.id == chosenID } ?? systemTemplate(for: account) }

    /// The "Now playing" post both system templates share. They differ in
    /// their hashtags only, because Bluesky's 300 graphemes leave less room.
    private static func nowPlayingBody(hashtags: String) -> String {
        """
        Now playing:

        🎤  {artist} with
        🎵  **{song_name}**
        💿  Released on "*{album_name}*" in {release_year}

        \(hashtags) {artist_hashtag}

        Try it out:
        {share_url}
        """
    }
}
