#if os(macOS)
//
//  AutoPost.swift
//  musiccloud
//

import Foundation
import Observation
import SwiftUI

// MARK: - AutoPostSettings

/// Whether new conversions are posted automatically, and for each connected
/// account whether it takes part and which template it posts with.
///
/// The settings are per account, because several accounts of one service
/// can be connected. They are kept as JSON under ``DefaultsKey/autoPost``.
@MainActor
@Observable
final class AutoPostSettings {
    /// One account's part in automatic posting.
    struct AccountRule: Codable, Equatable, Sendable {
        var isEnabled = false
        /// The template it posts with; `nil` or a deleted template means it does not post.
        var templateID: PostTemplate.ID?
    }

    /// The master switch. Off, nothing is posted automatically, whatever the accounts say.
    var isEnabled: Bool {
        didSet { save() }
    }

    private(set) var rules: [SocialAccount.ID: AccountRule]

    @ObservationIgnored private let defaults: UserDefaults

    private struct Stored: Codable {
        var isEnabled: Bool
        var rules: [SocialAccount.ID: AccountRule]
    }

    /// - Parameter defaults: Where the settings are kept; tests pass their own suite.
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.data(forKey: DefaultsKey.autoPost).flatMap { try? JSONDecoder().decode(Stored.self, from: $0) }
        isEnabled = stored?.isEnabled ?? false
        rules = stored?.rules ?? [:]
    }

    /// The rule of the account with `id`, off when it has none yet.
    func rule(for id: SocialAccount.ID) -> AccountRule {
        rules[id] ?? AccountRule()
    }

    func setRule(_ rule: AccountRule, for id: SocialAccount.ID) {
        rules[id] = rule
        save()
    }

    /// Forgets an account's rule, which disconnecting it does.
    func removeRule(for id: SocialAccount.ID) {
        rules[id] = nil
        save()
    }

    private func save() {
        defaults.set(try? JSONEncoder().encode(Stored(isEnabled: isEnabled, rules: rules)), forKey: DefaultsKey.autoPost)
    }
}

extension AutoPostSettings {
    /// A binding to one field of the rule of the account with `id`.
    ///
    /// The Settings rows edit a rule one field at a time, and every change
    /// goes through ``setRule(_:for:)``, so it is stored.
    func binding<Value>(_ field: WritableKeyPath<AccountRule, Value>, for id: SocialAccount.ID) -> Binding<Value> {
        Binding {
            self.rule(for: id)[keyPath: field]
        } set: { value in
            var rule = self.rule(for: id)
            rule[keyPath: field] = value
            self.setRule(rule, for: id)
        }
    }
}

// MARK: - AutoPostPlan

/// What automatic posting does with one new entry: which account posts
/// which text, and which accounts are left out and why.
struct AutoPostPlan: Equatable {
    /// Why an account that takes part does not post this entry.
    enum Skip: Equatable {
        /// Its template is gone.
        case missingTemplate
        /// The text is longer than the account allows.
        case tooLong(length: Int, limit: Int)
        /// The template renders nothing for this entry.
        case empty
    }

    var posts: [(account: SocialAccount, markdown: String)] = []
    var skipped: [(account: SocialAccount, reason: Skip)] = []

    static func == (lhs: AutoPostPlan, rhs: AutoPostPlan) -> Bool {
        lhs.posts.map(\.account) == rhs.posts.map(\.account) && lhs.posts.map(\.markdown) == rhs.posts.map(\.markdown)
            && lhs.skipped.map(\.account) == rhs.skipped.map(\.account) && lhs.skipped.map(\.reason) == rhs.skipped.map(\.reason)
    }

    /// The plan for an entry with `context`.
    ///
    /// Nothing is planned while the master switch is off. An account that is
    /// switched off is neither posted to nor reported as skipped, because the
    /// user did not ask for it.
    @MainActor
    static func make(context: PostContext, accounts: [SocialAccount], templates: [PostTemplate],
                     settings: AutoPostSettings) -> AutoPostPlan {
        var plan = AutoPostPlan()
        guard settings.isEnabled else { return plan }
        for account in accounts {
            let rule = settings.rule(for: account.id)
            guard rule.isEnabled else { continue }
            guard let template = templates.first(where: { $0.id == rule.templateID }) else {
                plan.skipped.append((account, .missingTemplate))
                continue
            }
            let markdown = PostTemplateRenderer.render(template.body, with: context)
            let length = account.length(ofMarkdown: markdown)
            if markdown.allSatisfy(\.isWhitespace) {
                plan.skipped.append((account, .empty))
            } else if length > account.limit {
                plan.skipped.append((account, .tooLong(length: length, limit: account.limit)))
            } else {
                plan.posts.append((account, markdown))
            }
        }
        return plan
    }
}

extension AutoPostPlan.Skip {
    /// The sentence the notification states for `handle`. Each reason is one
    /// whole sentence, so every language can order it as it needs.
    func message(for handle: String) -> String {
        switch self {
        case .missingTemplate:
            String(localized: "Not posted to \(handle), because its template no longer exists.")
        case .tooLong(let length, let limit):
            String(localized: "Not posted to \(handle), because the text has \(length) of \(limit) characters.")
        case .empty:
            String(localized: "Not posted to \(handle), because the template gives no text for this entry.")
        }
    }
}

#endif
