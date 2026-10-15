#if os(macOS)
//
//  AutoPoster.swift
//  musiccloud
//

import Foundation

// MARK: - AutoPoster

/// Posts a new history entry to the accounts chosen for automatic posting,
/// and reports in one notification where it went.
///
/// It runs after a conversion has stored the entry; ``ClipboardMonitor``
/// calls it through `onNewEntry`. The text is built the way the composer
/// builds it, from each account's default template, and an account whose
/// text does not fit is left out and named in the notification.
@MainActor
final class AutoPoster {
    private let settings: AutoPostSettings
    private let accountStore: SocialAccountStore
    private let templateStore: PostTemplateStore

    init(settings: AutoPostSettings, accountStore: SocialAccountStore, templateStore: PostTemplateStore) {
        self.settings = settings
        self.accountStore = accountStore
        self.templateStore = templateStore
    }

    /// Posts `entry` where the settings say, then notifies once.
    func post(_ entry: MediaEntry) async {
        let context = PostContext(entry: entry)
        let plan = AutoPostPlan.make(context: context, accounts: SocialAccount.all(in: accountStore),
                                     templates: templateStore.systemTemplates + templateStore.templates, settings: settings)
        guard !plan.posts.isEmpty || !plan.skipped.isEmpty else { return }

        var posted: [SocialAccount] = []
        var failed: [(SocialAccount, String)] = []
        for (account, markdown) in plan.posts {
            do {
                try await account.post(markdown)
                posted.append(account)
            } catch {
                failed.append((account, error.localizedDescription))
                AppLogger.api.error("Automatic post to \(account.handle) failed: \(error.localizedDescription)")
            }
        }

        var lines: [String] = []
        if !posted.isEmpty {
            lines.append(String(localized: "Posted to \(posted.map(\.handle).formatted(.list(type: .and)))."))
        }
        for (account, reason) in plan.skipped {
            lines.append(reason.message(for: account.handle))
        }
        for (account, message) in failed {
            lines.append(String(localized: "Posting to \(account.handle) failed: \(message)"))
        }
        NotificationManager.notify(title: String(localized: "Automatic post: \(context.title)"),
                                   body: lines.joined(separator: "\n"),
                                   identifier: "auto-post-\(entry.id.uuidString)")
    }
}

#endif
