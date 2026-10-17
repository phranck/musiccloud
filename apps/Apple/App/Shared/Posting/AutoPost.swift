#if os(macOS)
//
//  AutoPost.swift
//  musiccloud
//

import Foundation
import Observation
import SwiftUI

// MARK: - DefaultTemplates

/// The template each connected account posts with by default, where the user
/// chose one of their own.
///
/// An account without an entry posts with the system template of its
/// service; ``PostTemplate/defaultTemplate(for:chosenID:among:)`` decides
/// that, and ``template(for:among:)`` is the way the app asks it. The
/// composer, automatic posting, the Settings rows and the Template Editor
/// read the same entries, so a default set in one place shows in all of them.
/// The entries are kept as JSON under ``DefaultsKey/defaultTemplates``.
@MainActor @Observable final class DefaultTemplates {
    /// The chosen template per account. An account missing here, or naming
    /// a deleted template, falls back to its service's system template.
    private(set) var templateIDs: [SocialAccount.ID: PostTemplate.ID]

    @ObservationIgnored private let defaults: UserDefaults

    /// Reads the stored defaults, or on the first launch with this version
    /// takes over the templates the automatic posting rules named before,
    /// so nobody loses a template they chose there.
    ///
    /// - Parameter defaults: Where the defaults are kept; tests pass their own suite.
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: DefaultsKey.defaultTemplates) {
            templateIDs = (try? JSONDecoder().decode([SocialAccount.ID: PostTemplate.ID].self, from: data)) ?? [:]
        } else {
            templateIDs = Self.legacyAutoPostTemplateIDs(in: defaults)
            save()
        }
    }

    /// The template `account` posts with by default, out of `templates`.
    func template(for account: SocialAccount, among templates: [PostTemplate]) -> PostTemplate? {
        PostTemplate.defaultTemplate(for: account, chosenID: templateIDs[account.id], among: templates)
    }

    /// The accounts out of `accounts` whose default is `template`, which
    /// the Template Editor marks with a badge.
    func accounts(using template: PostTemplate, of accounts: [SocialAccount], among templates: [PostTemplate]) -> [SocialAccount] {
        accounts.filter { self.template(for: $0, among: templates)?.id == template.id }
    }

    /// Makes `id` the default of the account with `accountID`; `nil` returns it to its system template.
    func setTemplateID(_ id: PostTemplate.ID?, for accountID: SocialAccount.ID) {
        templateIDs[accountID] = id
        save()
    }

    private func save() { defaults.set(try? JSONEncoder().encode(templateIDs), forKey: DefaultsKey.defaultTemplates) }

    /// The shape automatic posting stored before the default template moved
    /// here: each rule named its own template.
    private struct LegacyAutoPost: Decodable {
        struct Rule: Decodable { var templateID: PostTemplate.ID? }

        var rules: [SocialAccount.ID: Rule]
    }

    /// The templates the old automatic posting rules in `defaults` chose, per account.
    private static func legacyAutoPostTemplateIDs(in defaults: UserDefaults) -> [SocialAccount.ID: PostTemplate.ID] {
        guard let data = defaults.data(forKey: DefaultsKey.autoPost),
            let legacy = try? JSONDecoder().decode(LegacyAutoPost.self, from: data)
        else { return [:] }
        return legacy.rules.compactMapValues(\.templateID)
    }
}

// MARK: - AutoPostSettings

/// Whether new conversions are posted automatically, and for each connected
/// account whether it takes part. An account that takes part posts with its
/// default template from ``DefaultTemplates``.
///
/// The settings are per account, because several accounts of one service
/// can be connected. They are kept as JSON under ``DefaultsKey/autoPost``.
@MainActor @Observable final class AutoPostSettings {
    /// One account's part in automatic posting.
    ///
    /// Rules stored by an earlier version also name a template. Decoding
    /// skips that field, and ``DefaultTemplates`` takes it over as the
    /// account's default.
    struct AccountRule: Codable, Equatable, Sendable { var isEnabled = false }

    /// The master switch. Off, nothing is posted automatically, whatever the accounts say.
    var isEnabled: Bool { didSet { save() } }

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
    func rule(for id: SocialAccount.ID) -> AccountRule { rules[id] ?? AccountRule() }

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
        /// The account has no default template, which only a service without a system template can lack.
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

    /// The plan for an entry with `context`, each account writing with its
    /// default template from `defaultTemplates`.
    ///
    /// Nothing is planned while the master switch is off. An account that is
    /// switched off is neither posted to nor reported as skipped, because the
    /// user did not ask for it.
    @MainActor static func make(
        context: PostContext,
        accounts: [SocialAccount],
        templates: [PostTemplate],
        settings: AutoPostSettings,
        defaultTemplates: DefaultTemplates
    ) -> AutoPostPlan {
        var plan = AutoPostPlan()
        guard settings.isEnabled else { return plan }
        for account in accounts {
            guard settings.rule(for: account.id).isEnabled else { continue }
            guard let template = defaultTemplates.template(for: account, among: templates) else {
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
        case .missingTemplate: String(localized: "Not posted to \(handle), because its template no longer exists.")
        case .tooLong(let length, let limit):
            String(localized: "Not posted to \(handle), because the text has \(length) of \(limit) characters.")
        case .empty: String(localized: "Not posted to \(handle), because the template gives no text for this entry.")
        }
    }
}

#endif
