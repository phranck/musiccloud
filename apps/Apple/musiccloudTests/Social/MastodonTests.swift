import CryptoKit
import Foundation
import Testing
@testable import musiccloud

// MARK: - MastodonInstanceURLTests

struct MastodonInstanceURLTests {
    @Test(arguments: [
        "mastodon.social", "  Mastodon.Social \n", "https://mastodon.social/about", "http://mastodon.social", "@phranck@mastodon.social",
        "phranck@mastodon.social",
    ]) func everyFormNamesTheSameInstance(input: String) {
        #expect(MastodonAPI.instanceURL(from: input) == URL(string: "https://mastodon.social"))
    }

    @Test(arguments: ["", "   ", "mastodon", "@phranck", "https://", ".social", "mastodon."]) func inputWithoutAHostIsRejected(
        input: String
    ) { #expect(MastodonAPI.instanceURL(from: input) == nil) }
}

// MARK: - MastodonRequestTests

struct MastodonRequestTests {
    private let instance = URL(string: "https://oldbytes.space")!
    private let app = MastodonAppCredentials(clientID: "client id", clientSecret: "se+cr&et")

    @Test func registrationAsksForTheScopesAndTheRedirect() throws {
        let request = MastodonAPI.registerAppRequest(instance: instance)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "https://oldbytes.space/api/v1/apps")
        let body = try #require(request.httpBody)
        let fields = try JSONDecoder().decode([String: String].self, from: body)
        #expect(fields["redirect_uris"] == "musiccloud://oauth/mastodon")
        #expect(fields["scopes"] == "write:statuses write:media read:accounts")
        #expect(fields["client_name"] == "musiccloud")
    }

    @Test func authorizationCarriesStatePKCEAndForcedLogin() throws {
        let url = MastodonAPI.authorizeURL(instance: instance, clientID: "abc", state: "xyz", codeChallenge: "challenge")
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        #expect(components.path == "/oauth/authorize")
        #expect(query["response_type"] == "code")
        #expect(query["client_id"] == "abc")
        #expect(query["redirect_uri"] == MastodonAPI.redirectURI)
        #expect(query["scope"] == MastodonAPI.scopes)
        #expect(query["state"] == "xyz")
        #expect(query["code_challenge"] == "challenge")
        #expect(query["code_challenge_method"] == "S256")
        #expect(query["force_login"] == "true")
    }

    /// `+` and `&` in a secret would otherwise read as a space and a new field.
    @Test func tokenRequestEncodesEveryFormValue() throws {
        let request = MastodonAPI.tokenRequest(instance: instance, app: app, code: "c=1", codeVerifier: "verifier")
        #expect(request.httpMethod == "POST")
        #expect(request.url?.path == "/oauth/token")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/x-www-form-urlencoded")
        let body = try #require(request.httpBody.flatMap { String(data: $0, encoding: .utf8) })
        #expect(
            body == "grant_type=authorization_code&code=c%3D1&client_id=client%20id&client_secret=se%2Bcr%26et"
                + "&redirect_uri=musiccloud%3A%2F%2Foauth%2Fmastodon&code_verifier=verifier"
        )
    }

    @Test func revokeSendsTheTokenWithTheClient() throws {
        let request = MastodonAPI.revokeRequest(instance: instance, app: app, token: "tok")
        #expect(request.url?.path == "/oauth/revoke")
        let body = try #require(request.httpBody.flatMap { String(data: $0, encoding: .utf8) })
        #expect(body == "client_id=client%20id&client_secret=se%2Bcr%26et&token=tok")
    }

    @Test func verifyCredentialsSendsTheBearerToken() {
        let request = MastodonAPI.verifyCredentialsRequest(instance: instance, token: "tok")
        #expect(request.url?.path == "/api/v1/accounts/verify_credentials")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
    }

    @Test func challengeIsTheBase64URLOfTheVerifiersHash() {
        let verifier = OAuthSupport.makeCodeVerifier()
        #expect(verifier.count == 43)
        #expect(verifier.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
        let expected = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        #expect(OAuthSupport.codeChallenge(for: verifier) == expected)
    }
}

// MARK: - MastodonAnswerTests

struct MastodonAnswerTests {
    @Test func appCredentialsDecodeFromTheRegistrationAnswer() throws {
        let json = #"{"id":"1","name":"musiccloud","client_id":"abc","client_secret":"def","client_secret_expires_at":0}"#
        let credentials = try JSONDecoder().decode(MastodonAppCredentials.self, from: Data(json.utf8))
        #expect(credentials == MastodonAppCredentials(clientID: "abc", clientSecret: "def"))
    }

    @Test func accountAndCharacterLimitDecode() throws {
        let account = try MastodonAPI.decoder.decode(
            MastodonCredentialAccount.self,
            from: Data(
                #"{"id":"42","username":"musiccloud","acct":"musiccloud","display_name":"musiccloud","avatar":"https://oldbytes.space/a.png"}"#
                    .utf8
            )
        )
        #expect(account.id == "42")
        #expect(account.displayName == "musiccloud")
        let instance = try MastodonAPI.decoder.decode(
            MastodonInstanceDescription.self,
            from: Data(#"{"configuration":{"statuses":{"max_characters":5000}}}"#.utf8)
        )
        #expect(instance.configuration?.statuses?.maxCharacters == 5000)
    }
}

// MARK: - SocialAccountStoreTests

@MainActor struct SocialAccountStoreTests {
    private func account(_ id: String, host: String = "oldbytes.space") -> MastodonAccount {
        MastodonAccount(
            instance: URL(string: "https://\(host)")!,
            accountID: id,
            username: "user\(id)",
            displayName: "",
            avatarURL: nil,
            characterLimit: 500
        )
    }

    private func bluesky(_ did: String) -> BlueskyAccount {
        BlueskyAccount(did: did, handle: "name.bsky.social", displayName: "", avatarURL: nil, pds: URL(string: "https://pds.example")!)
    }

    private func session(_ token: String) -> BlueskySession {
        BlueskySession(
            accessToken: token,
            refreshToken: "refresh-\(token)",
            expiresAt: nil,
            dpopKey: DPoPKey().rawRepresentation,
            issuer: "https://bsky.social",
            tokenEndpoint: URL(string: "https://bsky.social/oauth/token")!,
            revocationEndpoint: nil
        )
    }

    /// A folder whose name contains a space, like "Application Support".
    private func temporaryFolder() throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appending(path: "social accounts \(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    @Test func accountsSurviveARestartWithoutTheirSecrets() throws {
        let folder = try temporaryFolder()
        let store = SocialAccountStore(directory: folder, keychain: nil)
        store.add(account("1"), token: "secret-token")
        store.add(bluesky("did:plc:abc"), session: session("secret-access"))

        let reloaded = SocialAccountStore(directory: folder, keychain: nil)
        #expect(reloaded.mastodonAccounts == [account("1")])
        #expect(reloaded.blueskyAccounts == [bluesky("did:plc:abc")])
        for name in ["social-accounts.json", "bluesky-accounts.json"] {
            let stored = try String(contentsOf: folder.appending(path: name), encoding: .utf8)
            #expect(!stored.contains("secret"))
        }
    }

    @Test func blueskySessionIsReplacedAndRemoved() {
        let store = SocialAccountStore(directory: nil, keychain: nil)
        store.add(bluesky("did:plc:abc"), session: session("one"))
        store.setSession(session("two"), for: bluesky("did:plc:abc"))
        #expect(store.session(for: bluesky("did:plc:abc"))?.accessToken == "two")
        store.remove(bluesky("did:plc:abc"))
        #expect(store.blueskyAccounts.isEmpty)
        #expect(store.session(for: bluesky("did:plc:abc")) == nil)
    }

    @Test func sameIdOnTwoInstancesAreTwoAccounts() {
        let store = SocialAccountStore(directory: nil, keychain: nil)
        store.add(account("1"), token: "a")
        store.add(account("1", host: "mastodon.social"), token: "b")
        store.add(account("1"), token: "c")
        #expect(store.mastodonAccounts.count == 2)
        #expect(store.token(for: account("1")) == "c")
    }

    @Test func removingForgetsTheToken() {
        let store = SocialAccountStore(directory: nil, keychain: nil)
        store.add(account("1"), token: "a")
        store.remove(account("1"))
        #expect(store.mastodonAccounts.isEmpty)
        #expect(store.token(for: account("1")) == nil)
    }

    @Test func handleNamesUserAndInstance() {
        #expect(account("1").handle == "@user1@oldbytes.space")
        #expect(account("1").name == "user1")
    }
}
