import Foundation
import Testing
@testable import musiccloud

// MARK: - AutoPostTests

@MainActor
struct AutoPostTests {
    private let context = PostContext(
        track: TrackInfo(title: "MoonDial", artists: ["Pat Metheny"], albumName: "MoonDial", durationMs: 383_000, releaseDate: "2024-07-26"),
        album: nil, artist: nil, shareURL: "https://musiccloud.io/x", originalURL: "", serviceLinks: [])

    private let short = PostTemplate(name: "Short", body: "{song_name} {share_url}")
    private let long = PostTemplate(name: "Long", body: String(repeating: "x", count: 301))
    /// A name that is no variable renders as nothing, and its line goes with it.
    private let blank = PostTemplate(name: "Blank", body: "{no_such_variable}\n")

    private let first = SocialAccount.mastodon(MastodonAccount(
        instance: URL(string: "https://oldbytes.space")!, accountID: "1", username: "a", displayName: "", avatarURL: nil, characterLimit: 500))
    private let second = SocialAccount.mastodon(MastodonAccount(
        instance: URL(string: "https://mastodon.social")!, accountID: "2", username: "b", displayName: "", avatarURL: nil, characterLimit: 500))
    private let bluesky = SocialAccount.bluesky(BlueskyAccount(
        did: "did:plc:abc", handle: "c.bsky.social", displayName: "", avatarURL: nil, pds: URL(string: "https://pds.example")!))

    /// A suite of its own, so the test never reads or writes the app's settings.
    private func makeDefaults() -> UserDefaults {
        let suite = "AutoPostTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private func plan(_ settings: AutoPostSettings, _ defaultTemplates: DefaultTemplates) -> AutoPostPlan {
        AutoPostPlan.make(context: context, accounts: [first, second, bluesky], templates: [short, long, blank],
                          settings: settings, defaultTemplates: defaultTemplates)
    }

    @Test func nothingPostsWhileTheMasterSwitchIsOff() {
        let defaults = makeDefaults()
        let settings = AutoPostSettings(defaults: defaults)
        settings.setRule(.init(isEnabled: true), for: first.id)
        #expect(plan(settings, DefaultTemplates(defaults: defaults)) == AutoPostPlan())
    }

    /// Two Mastodon accounts are decided one by one, so one can post while the other does not.
    @Test func eachAccountPostsWithItsDefaultTemplate() {
        let defaults = makeDefaults()
        let settings = AutoPostSettings(defaults: defaults)
        let defaultTemplates = DefaultTemplates(defaults: defaults)
        settings.isEnabled = true
        settings.setRule(.init(isEnabled: true), for: first.id)
        settings.setRule(.init(isEnabled: false), for: second.id)
        defaultTemplates.setTemplateID(short.id, for: first.id)
        let plan = plan(settings, defaultTemplates)
        #expect(plan.posts.map(\.account) == [first])
        #expect(plan.posts.first?.markdown == "MoonDial https://musiccloud.io/x")
        #expect(plan.skipped.isEmpty)
    }

    /// An account whose default template was deleted posts with its system template instead.
    @Test func accountsWhoseTextCannotGoAreNamedWithTheReason() throws {
        let defaults = makeDefaults()
        let settings = AutoPostSettings(defaults: defaults)
        let defaultTemplates = DefaultTemplates(defaults: defaults)
        settings.isEnabled = true
        for account in [first, second, bluesky] {
            settings.setRule(.init(isEnabled: true), for: account.id)
        }
        defaultTemplates.setTemplateID(long.id, for: bluesky.id)
        defaultTemplates.setTemplateID(blank.id, for: first.id)
        defaultTemplates.setTemplateID(UUID(), for: second.id)
        let plan = plan(settings, defaultTemplates)
        let system = try #require(PostTemplate.systemTemplate(for: second))
        #expect(plan.posts.map(\.account) == [second])
        #expect(plan.posts.first?.markdown == PostTemplateRenderer.render(system.body, with: context))
        #expect(plan.skipped.map(\.account) == [first, bluesky])
        #expect(plan.skipped.map(\.reason) == [.empty, .tooLong(length: 301, limit: 300)])
    }

    @Test func settingsSurviveARestartAndForgetARemovedAccount() {
        let suite = "AutoPostTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let settings = AutoPostSettings(defaults: defaults)
        settings.isEnabled = true
        settings.setRule(.init(isEnabled: true), for: first.id)
        settings.setRule(.init(isEnabled: true), for: bluesky.id)
        settings.removeRule(for: bluesky.id)

        let reloaded = AutoPostSettings(defaults: defaults)
        #expect(reloaded.isEnabled)
        #expect(reloaded.rule(for: first.id) == .init(isEnabled: true))
        #expect(reloaded.rule(for: bluesky.id) == .init())
    }
}

// MARK: - DefaultTemplatesTests

@MainActor
struct DefaultTemplatesTests {
    private let mine = PostTemplate(name: "Mine", body: "{song_name}")

    private let mastodon = SocialAccount.mastodon(MastodonAccount(
        instance: URL(string: "https://oldbytes.space")!, accountID: "1", username: "a", displayName: "", avatarURL: nil, characterLimit: 500))
    private let bluesky = SocialAccount.bluesky(BlueskyAccount(
        did: "did:plc:abc", handle: "c.bsky.social", displayName: "", avatarURL: nil, pds: URL(string: "https://pds.example")!))

    private func makeDefaults() -> UserDefaults {
        let suite = "DefaultTemplatesTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    private var templates: [PostTemplate] { PostTemplate.system + [mine] }

    @Test func withoutAChoiceEachAccountUsesItsServicesSystemTemplate() {
        let defaultTemplates = DefaultTemplates(defaults: makeDefaults())
        #expect(defaultTemplates.template(for: mastodon, among: templates)?.icon == .mastodon)
        #expect(defaultTemplates.template(for: bluesky, among: templates)?.icon == .bluesky)
        #expect(PostTemplate.defaultTemplate(for: bluesky) == PostTemplate.systemTemplate(for: bluesky))
    }

    @Test func aChosenDefaultAppliesToItsAccountOnlyAndSurvivesARestart() {
        let defaults = makeDefaults()
        DefaultTemplates(defaults: defaults).setTemplateID(mine.id, for: mastodon.id)

        let reloaded = DefaultTemplates(defaults: defaults)
        #expect(reloaded.template(for: mastodon, among: templates) == mine)
        #expect(reloaded.template(for: bluesky, among: templates) == PostTemplate.systemTemplate(for: bluesky))
        #expect(reloaded.accounts(using: mine, of: [mastodon, bluesky], among: templates) == [mastodon])
    }

    @Test func aDeletedDefaultFallsBackToTheSystemTemplate() {
        let defaultTemplates = DefaultTemplates(defaults: makeDefaults())
        defaultTemplates.setTemplateID(mine.id, for: mastodon.id)
        #expect(defaultTemplates.template(for: mastodon, among: PostTemplate.system) == PostTemplate.systemTemplate(for: mastodon))
    }

    /// Automatic posting stored each account's template in its rule before
    /// the default template existed; that choice becomes the default.
    @Test func anOldAutoPostRuleHandsItsTemplateToTheDefault() throws {
        let defaults = makeDefaults()
        let legacy = """
            {"isEnabled":true,"rules":{"\(mastodon.id)":{"isEnabled":true,"templateID":"\(mine.id.uuidString)"},\
            "\(bluesky.id)":{"isEnabled":false}}}
            """
        defaults.set(Data(legacy.utf8), forKey: DefaultsKey.autoPost)

        let defaultTemplates = DefaultTemplates(defaults: defaults)
        #expect(defaultTemplates.templateIDs == [mastodon.id: mine.id])
        #expect(defaultTemplates.template(for: mastodon, among: templates) == mine)

        let settings = AutoPostSettings(defaults: defaults)
        #expect(settings.isEnabled)
        #expect(settings.rule(for: mastodon.id) == .init(isEnabled: true))

        // Once taken over, the defaults are read from their own key, so a
        // later change is not undone by the old rule.
        defaultTemplates.setTemplateID(nil, for: mastodon.id)
        #expect(DefaultTemplates(defaults: defaults).templateIDs.isEmpty)
    }
}
