//
//  PostComposerModel.swift
//  musiccloud
//

import Foundation
import Observation

// MARK: - PostComposerModel

/// The state of a post: which template, which accounts, the text for each
/// account, and how posting went.
///
/// Every account gets its own text, filled from the template, because the
/// services count differently and a post often has to be shortened for one
/// of them. Choosing another template fills every text again. The text is
/// Markdown; each account converts it when it posts, and counts it as it
/// will be sent.
///
/// The Mac's composer and the iOS Share Extension both post through it, so
/// both count, check and send a post alike.
@MainActor
@Observable
final class PostComposerModel {
    /// How posting went for one account.
    enum PostState: Equatable, Sendable {
        case idle
        case posting
        case posted
        case failed(String)
    }

    let context: PostContext
    let templates: [PostTemplate]
    private(set) var accounts: [SocialAccount]
    /// The accounts the post goes to.
    var selectedAccountIDs: Set<SocialAccount.ID>
    /// The text per account, Markdown as the template renders it.
    var drafts: [SocialAccount.ID: String] = [:]
    private(set) var states: [SocialAccount.ID: PostState] = [:]

    /// The template the texts come from. Choosing one fills every text again.
    var templateID: PostTemplate.ID? {
        didSet { fillDrafts() }
    }

    /// - Parameters:
    ///   - context: The history entry's values for the template's variables.
    ///   - templates: The templates to choose from, the first one chosen.
    ///   - accounts: The connected accounts, all of them chosen.
    init(context: PostContext, templates: [PostTemplate], accounts: [SocialAccount]) {
        self.context = context
        self.templates = templates
        self.accounts = accounts
        selectedAccountIDs = Set(accounts.map(\.id))
        templateID = templates.first?.id
        fillDrafts()
    }

    /// Creates a post in which every account starts from its own template and none is chosen yet.
    ///
    /// The Share Extension offers no template choice: each account posts
    /// with the template of its service, and the user picks the accounts.
    ///
    /// - Parameters:
    ///   - context: The history entry's values for the template's variables.
    ///   - accounts: The connected accounts, none of them chosen.
    ///   - template: The template each account's text is filled from; `nil` leaves it empty.
    init(context: PostContext, accounts: [SocialAccount], template: (SocialAccount) -> PostTemplate?) {
        self.context = context
        templates = []
        self.accounts = accounts
        selectedAccountIDs = []
        templateID = nil
        for account in accounts {
            drafts[account.id] = PostTemplateRenderer.render(template(account)?.body ?? "", with: context)
        }
    }

    /// What the entry is called; see ``PostContext/title``.
    var title: String { context.title }

    /// The chosen accounts in the order they are listed.
    var selectedAccounts: [SocialAccount] {
        accounts.filter { selectedAccountIDs.contains($0.id) }
    }

    /// The length `account` counts for its text.
    func length(for account: SocialAccount) -> Int {
        account.length(ofMarkdown: drafts[account.id] ?? "")
    }

    /// Whether the text for `account` is empty or longer than it allows.
    func isOutOfBounds(_ account: SocialAccount) -> Bool {
        let text = drafts[account.id] ?? ""
        return text.allSatisfy(\.isWhitespace) || length(for: account) > account.limit
    }

    var isPosting: Bool { states.values.contains(.posting) }

    /// Whether every chosen account has posted.
    var isDone: Bool {
        !selectedAccounts.isEmpty && selectedAccounts.allSatisfy { states[$0.id] == .posted }
    }

    /// Whether Post can be pressed: something is chosen, every text fits, nothing is on its way.
    var canPost: Bool {
        !selectedAccounts.isEmpty && !isPosting && selectedAccounts.allSatisfy { !isOutOfBounds($0) && states[$0.id] != .posted }
    }

    /// Replaces an account with what its server now says, such as a new limit.
    func replace(_ account: SocialAccount) {
        guard let index = accounts.firstIndex(where: { $0.id == account.id }) else { return }
        accounts[index] = account
    }

    /// Posts every chosen account's text through `send`, all at once.
    ///
    /// An account that posted already is skipped, so pressing Post again
    /// after one failed only retries that one.
    func post(using send: @escaping @MainActor @Sendable (SocialAccount, String) async throws -> Void) async {
        let pending = selectedAccounts.filter { states[$0.id] != .posted }
        for account in pending {
            states[account.id] = .posting
        }
        await withTaskGroup(of: (SocialAccount.ID, PostState).self) { group in
            for account in pending {
                let text = drafts[account.id] ?? ""
                group.addTask {
                    do {
                        try await send(account, text)
                        return (account.id, .posted)
                    } catch {
                        return (account.id, .failed(error.localizedDescription))
                    }
                }
            }
            for await (id, state) in group {
                states[id] = state
            }
        }
    }
}

private extension PostComposerModel {
    func fillDrafts() {
        let body = templates.first { $0.id == templateID }?.body ?? ""
        let rendered = PostTemplateRenderer.render(body, with: context)
        for account in accounts {
            drafts[account.id] = rendered
        }
        states = [:]
    }
}
