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

    /// Settings in a suite of their own, so the test never reads or writes the app's.
    private func settings() -> AutoPostSettings {
        let suite = "AutoPostTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return AutoPostSettings(defaults: defaults)
    }

    private func plan(_ settings: AutoPostSettings) -> AutoPostPlan {
        AutoPostPlan.make(context: context, accounts: [first, second, bluesky], templates: [short, long, blank], settings: settings)
    }

    @Test func nothingPostsWhileTheMasterSwitchIsOff() {
        let settings = settings()
        settings.setRule(.init(isEnabled: true, templateID: short.id), for: first.id)
        #expect(plan(settings) == AutoPostPlan())
    }

    /// Two Mastodon accounts are decided one by one, so one can post while the other does not.
    @Test func eachAccountPostsWithItsOwnTemplate() {
        let settings = settings()
        settings.isEnabled = true
        settings.setRule(.init(isEnabled: true, templateID: short.id), for: first.id)
        settings.setRule(.init(isEnabled: false, templateID: short.id), for: second.id)
        let plan = plan(settings)
        #expect(plan.posts.map(\.account) == [first])
        #expect(plan.posts.first?.markdown == "MoonDial https://musiccloud.io/x")
        #expect(plan.skipped.isEmpty)
    }

    @Test func accountsWhoseTextCannotGoAreNamedWithTheReason() {
        let settings = settings()
        settings.isEnabled = true
        settings.setRule(.init(isEnabled: true, templateID: long.id), for: bluesky.id)
        settings.setRule(.init(isEnabled: true, templateID: blank.id), for: first.id)
        settings.setRule(.init(isEnabled: true, templateID: UUID()), for: second.id)
        let plan = plan(settings)
        #expect(plan.posts.isEmpty)
        #expect(plan.skipped.map(\.account) == [first, second, bluesky])
        #expect(plan.skipped.map(\.reason) == [.empty, .missingTemplate, .tooLong(length: 301, limit: 300)])
    }

    @Test func settingsSurviveARestartAndForgetARemovedAccount() {
        let suite = "AutoPostTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let settings = AutoPostSettings(defaults: defaults)
        settings.isEnabled = true
        settings.setRule(.init(isEnabled: true, templateID: short.id), for: first.id)
        settings.setRule(.init(isEnabled: true, templateID: short.id), for: bluesky.id)
        settings.removeRule(for: bluesky.id)

        let reloaded = AutoPostSettings(defaults: defaults)
        #expect(reloaded.isEnabled)
        #expect(reloaded.rule(for: first.id) == .init(isEnabled: true, templateID: short.id))
        #expect(reloaded.rule(for: bluesky.id) == .init())
    }
}
