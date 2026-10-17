//
//  SocialService.swift
//  musiccloud
//

import SwiftUI

// MARK: - SocialService

/// The services an account can be connected for, with the wording each needs.
///
/// The Social Media pane on the Mac and the Social Media screen on iOS both
/// build their sections and their connect sheet from it, so both platforms
/// ask for the same input and say the same thing about it.
enum SocialService: String, CaseIterable, Identifiable, Sendable {
    case mastodon
    case bluesky

    var id: String { rawValue }

    /// The service's name, which is a brand and stays untranslated.
    var name: String {
        switch self {
        case .mastodon: "Mastodon"
        case .bluesky: "Bluesky"
        }
    }

    /// The service's logo.
    var icon: PostTemplateIcon {
        switch self {
        case .mastodon: .mastodon
        case .bluesky: .bluesky
        }
    }

    /// The service's brand color, the one its logo is drawn in; see ``PostTemplateIcon/brandColor``.
    var brandColor: Color { icon.brandColor ?? .secondary }

    /// The title of the sheet that connects an account.
    var sheetTitle: String {
        switch self {
        case .mastodon: String(localized: "Connect Mastodon Account")
        case .bluesky: String(localized: "Connect Bluesky Account")
        }
    }

    /// What the connect sheet asks for, and that the password goes to the service's own page.
    var sheetExplanation: String {
        switch self {
        case .mastodon: String(localized: "Enter the server your account is on. You sign in on its own page.")
        case .bluesky: String(localized: "Enter your Bluesky name. A handle on a domain of your own, such as musiccloud.io, works as well.")
        }
    }

    /// The label of the connect sheet's text field.
    var fieldLabel: String {
        switch self {
        case .mastodon: String(localized: "Server")
        case .bluesky: String(localized: "Handle")
        }
    }

    /// An example input, which is an address and stays untranslated.
    var placeholder: String {
        switch self {
        case .mastodon: "mastodon.social"
        case .bluesky: "name"
        }
    }

    /// The end of the handle shown beside the field while the input has no
    /// domain of its own, which ``BlueskyAPI/handle(from:)`` then adds.
    func fixedSuffix(for input: String) -> String? {
        switch self {
        case .mastodon: nil
        case .bluesky: input.contains(".") ? nil : "." + BlueskyAPI.defaultHandleDomain
        }
    }

    /// The note below the service's accounts, which says where the password stays.
    var footer: String {
        switch self {
        case .mastodon: String(localized: "musiccloud can post to these accounts. Your password stays with your server.")
        case .bluesky: String(localized: "musiccloud can post to these accounts. Your password stays with Bluesky.")
        }
    }

    /// The accounts of this service in `store`, in the order they were connected.
    @MainActor func accounts(in store: SocialAccountStore) -> [SocialAccount] {
        switch self {
        case .mastodon: store.mastodonAccounts.map(SocialAccount.mastodon)
        case .bluesky: store.blueskyAccounts.map(SocialAccount.bluesky)
        }
    }

    /// Signs in the account `input` names on this service and stores it.
    ///
    /// - Throws: ``SocialServiceError``, `CancellationError` when the user closes the browser sheet, or a network error.
    @MainActor func connect(_ input: String) async throws {
        let connections = SocialConnections.shared
        switch self {
        case .mastodon: try await connections.mastodon.connect(instanceInput: input)
        case .bluesky: try await connections.bluesky.connect(handleInput: input)
        }
    }
}
