import Foundation
import Testing
@testable import musiccloud

// MARK: - SocialServiceTests

struct SocialServiceTests {
    @Test(arguments: ["", "name", "@name"])
    func aBareBlueskyNameShowsTheDefaultDomain(input: String) {
        #expect(SocialService.bluesky.fixedSuffix(for: input) == ".bsky.social")
    }

    @Test(arguments: ["name.bsky.social", "musiccloud.io", "name."])
    func aBlueskyHandleWithADomainShowsNoSuffix(input: String) {
        #expect(SocialService.bluesky.fixedSuffix(for: input) == nil)
    }

    @Test(arguments: ["", "mastodon.social", "phranck"])
    func aMastodonServerShowsNoSuffix(input: String) {
        #expect(SocialService.mastodon.fixedSuffix(for: input) == nil)
    }

    @MainActor
    @Test func eachServiceListsOnlyItsOwnAccounts() {
        let store = SocialAccountStore(directory: nil, keychain: nil)
        let mastodon = MastodonAccount(instance: URL(string: "https://oldbytes.space")!, accountID: "1", username: "musiccloud",
                                       displayName: "musiccloud", avatarURL: nil, characterLimit: 5000)
        store.add(mastodon, token: "token")
        #expect(SocialService.mastodon.accounts(in: store) == [.mastodon(mastodon)])
        #expect(SocialService.bluesky.accounts(in: store).isEmpty)
    }
}

// MARK: - SocialAccountStoreLocationTests

#if os(macOS)
struct SocialAccountStoreLocationTests {
    /// The Mac reads the accounts it connected before iOS had any, so their
    /// folder and Keychain group stay where they were.
    @Test func theMacKeepsItsAccountsInApplicationSupport() {
        #expect(SocialAccountStore.defaultDirectory() == URL.applicationSupportFolder())
        #expect(SocialAccountStore.defaultKeychain.accessGroup == nil)
        #expect(SocialAccountStore.defaultKeychain.service == "io.musiccloud.social-accounts")
    }
}
#endif

// MARK: - ConnectAccountModelTests

@MainActor
struct ConnectAccountModelTests {
    private struct Refusal: LocalizedError {
        var errorDescription: String? { "Refused" }
    }

    @Test func blankInputCannotConnect() {
        let model = ConnectAccountModel(service: .mastodon) { _ in }
        #expect(!model.canConnect)
        model.input = "   "
        #expect(!model.canConnect)
        model.input = "mastodon.social"
        #expect(model.canConnect)
    }

    @Test func aConnectedAccountClosesTheSheet() async {
        var received: String?
        let model = ConnectAccountModel(service: .bluesky) { input in received = input }
        model.input = "name"
        #expect(await model.connect())
        #expect(received == "name")
        #expect(model.errorMessage == nil)
        #expect(!model.isWorking)
    }

    @Test func aFailureShowsItsMessageUntilTheInputChanges() async {
        let model = ConnectAccountModel(service: .mastodon) { _ in throw Refusal() }
        model.input = "mastodon.social"
        #expect(await !model.connect())
        #expect(model.errorMessage == "Refused")
        #expect(!model.isWorking)

        model.input = "mastodon.social"
        #expect(model.errorMessage == "Refused")
        model.input = "oldbytes.space"
        #expect(model.errorMessage == nil)
    }

    @Test func aCancelledSignInShowsNoMessage() async {
        let model = ConnectAccountModel(service: .mastodon) { _ in throw CancellationError() }
        model.input = "mastodon.social"
        #expect(await !model.connect())
        #expect(model.errorMessage == nil)
        #expect(model.input == "mastodon.social")
    }
}
