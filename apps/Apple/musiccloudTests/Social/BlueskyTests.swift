import CryptoKit
import Foundation
import Synchronization
import Testing
@testable import musiccloud

// MARK: - BlueskyDiscoveryTests

struct BlueskyDiscoveryTests {
    @Test(arguments: ["name.bsky.social", "@Name.Bsky.Social", "  name.bsky.social\n"])
    func handleIsNormalized(input: String) {
        #expect(BlueskyAPI.handle(from: input) == "name.bsky.social")
    }

    /// Text copied from a web page carries invisible direction marks and
    /// zero-width characters around the handle; a profile link names it too.
    @Test(arguments: [
        "\u{2066}@name.bsky.social\u{2069}",
        "\u{202A}name.bsky.social\u{202C}",
        "name\u{200B}.bsky.social",
        "\u{FEFF}name.bsky.social",
        "https://bsky.app/profile/name.bsky.social",
        "bsky.app/profile/@name.bsky.social/",
    ])
    func handleIsFoundInPastedText(input: String) {
        #expect(BlueskyAPI.handle(from: input) == "name.bsky.social")
    }

    /// A bare name is a handle on bsky.social, which the field shows beside it.
    @Test(arguments: ["phranck", "@Phranck", "\u{2066}phranck\u{2069}"])
    func bareNameGetsBlueskysDomain(input: String) {
        #expect(BlueskyAPI.handle(from: input) == "phranck.bsky.social")
    }

    @Test(arguments: ["", "@", ".bsky.social", "name.", "na me.bsky.social", "na me", "https://bsky.app"])
    func inputThatCannotBeAHandleIsRejected(input: String) {
        #expect(BlueskyAPI.handle(from: input) == nil)
    }

    @Test func didDocumentsAreFoundForPLCAndWeb() {
        #expect(BlueskyAPI.didDocumentURL(did: "did:plc:z72i7hdynmk6r22z27h6tvur")?.absoluteString
            == "https://plc.directory/did:plc:z72i7hdynmk6r22z27h6tvur")
        #expect(BlueskyAPI.didDocumentURL(did: "did:web:example.com")?.absoluteString == "https://example.com/.well-known/did.json")
        #expect(BlueskyAPI.didDocumentURL(did: "did:web:example.com:user") == nil)
        #expect(BlueskyAPI.didDocumentURL(did: "did:key:abc") == nil)
    }

    @Test func documentNamesThePDSAndConfirmsTheHandle() throws {
        let json = #"""
        {"id":"did:plc:abc","alsoKnownAs":["at://name.bsky.social"],
         "service":[{"id":"#atproto_pds","type":"AtprotoPersonalDataServer","serviceEndpoint":"https://pds.example"}]}
        """#
        let document = try JSONDecoder().decode(BlueskyDIDDocument.self, from: Data(json.utf8))
        #expect(document.pdsEndpoint == URL(string: "https://pds.example"))
        #expect(document.confirms(handle: "name.bsky.social"))
        #expect(!document.confirms(handle: "other.bsky.social"))
    }

    /// A PDS reached over plain HTTP would carry the tokens in the clear.
    @Test func pdsWithoutHTTPSIsIgnored() throws {
        let json = ##"{"id":"did:plc:abc","service":[{"id":"#atproto_pds","type":"AtprotoPersonalDataServer","serviceEndpoint":"http://pds.example"}]}"##
        #expect(try JSONDecoder().decode(BlueskyDIDDocument.self, from: Data(json.utf8)).pdsEndpoint == nil)
    }
}

// MARK: - BlueskyRequestTests

struct BlueskyRequestTests {
    private let server = URL(string: "https://bsky.social/oauth/par")!

    private func fields(_ request: URLRequest) throws -> [String: String] {
        let body = try #require(request.httpBody.flatMap { String(data: $0, encoding: .utf8) })
        return Dictionary(uniqueKeysWithValues: body.split(separator: "&").map { pair in
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            return (parts[0], parts.count > 1 ? (parts[1].removingPercentEncoding ?? "") : "")
        })
    }

    @Test func pushedRequestCarriesEverythingTheProfileRequires() throws {
        let request = BlueskyAPI.pushedAuthorizationRequest(endpoint: server, state: "s", codeChallenge: "c", loginHint: "name.bsky.social")
        let form = try fields(request)
        #expect(request.httpMethod == "POST")
        #expect(form["client_id"] == "https://musiccloud.io/oauth/client-metadata.json")
        #expect(form["response_type"] == "code")
        #expect(form["redirect_uri"] == "io.musiccloud:/oauth/bluesky")
        #expect(form["scope"] == "atproto transition:generic")
        #expect(form["state"] == "s")
        #expect(form["code_challenge"] == "c")
        #expect(form["code_challenge_method"] == "S256")
        #expect(form["login_hint"] == "name.bsky.social")
    }

    @Test func authorizePageOnlyNamesThePushedRequest() throws {
        let url = BlueskyAPI.authorizeURL(endpoint: URL(string: "https://bsky.social/oauth/authorize")!, requestURI: "urn:x")
        let items = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        #expect(Set(items.map(\.name)) == ["client_id", "request_uri"])
        #expect(url.queryValue("request_uri") == "urn:x")
    }

    @Test func tokenAndRefreshRequestsNameTheClientWithoutSecret() throws {
        let token = try fields(BlueskyAPI.tokenRequest(endpoint: server, code: "code", codeVerifier: "verifier"))
        #expect(token["grant_type"] == "authorization_code")
        #expect(token["code_verifier"] == "verifier")
        #expect(token["client_secret"] == nil)
        let refresh = try fields(BlueskyAPI.refreshRequest(endpoint: server, refreshToken: "r"))
        #expect(refresh["grant_type"] == "refresh_token")
        #expect(refresh["refresh_token"] == "r")
        #expect(refresh["client_id"] == BlueskyAPI.clientID)
    }

    @Test func authorizationServerMetadataDecodes() throws {
        let json = #"""
        {"issuer":"https://bsky.social","authorization_endpoint":"https://bsky.social/oauth/authorize",
         "token_endpoint":"https://bsky.social/oauth/token","pushed_authorization_request_endpoint":"https://bsky.social/oauth/par",
         "revocation_endpoint":"https://bsky.social/oauth/revoke"}
        """#
        let server = try BlueskyAPI.decoder.decode(BlueskyAuthorizationServer.self, from: Data(json.utf8))
        #expect(server.pushedAuthorizationRequestEndpoint.path == "/oauth/par")
        #expect(server.revocationEndpoint?.path == "/oauth/revoke")
    }
}

// MARK: - DPoPKeyTests

struct DPoPKeyTests {
    private func decode(_ segment: Substring) throws -> [String: Any] {
        var base64 = segment.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
        let data = try #require(Data(base64Encoded: base64))
        return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    @Test func proofIsASignedES256JWTForTheRequest() throws {
        let key = DPoPKey()
        let proof = try key.proof(method: "POST", url: URL(string: "https://bsky.social/oauth/token?x=1#y")!, nonce: "n1",
                                  now: Date(timeIntervalSince1970: 1_700_000_000))
        let parts = proof.split(separator: ".")
        #expect(parts.count == 3)

        let header = try decode(parts[0])
        #expect(header["typ"] as? String == "dpop+jwt")
        #expect(header["alg"] as? String == "ES256")
        #expect((header["jwk"] as? [String: String]) == key.publicJWK)

        let claims = try decode(parts[1])
        #expect(claims["htm"] as? String == "POST")
        #expect(claims["htu"] as? String == "https://bsky.social/oauth/token")
        #expect(claims["iat"] as? Int == 1_700_000_000)
        #expect(claims["nonce"] as? String == "n1")
        #expect(claims["ath"] == nil)
        #expect(claims["iss"] == nil)

        var signatureBase64 = String(parts[2]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        signatureBase64 += String(repeating: "=", count: (4 - signatureBase64.count % 4) % 4)
        let signature = try P256.Signing.ECDSASignature(rawRepresentation: #require(Data(base64Encoded: signatureBase64)))
        #expect(key.privateKey.publicKey.isValidSignature(signature, for: Data("\(parts[0]).\(parts[1])".utf8)))
    }

    @Test func proofForAResourceNamesTheTokenByItsHash() throws {
        let proof = try DPoPKey().proof(method: "GET", url: URL(string: "https://pds.example/xrpc/x")!, nonce: nil, accessToken: "token")
        let claims = try decode(proof.split(separator: ".")[1])
        #expect(claims["ath"] as? String == OAuthSupport.base64URL(Data(SHA256.hash(data: Data("token".utf8)))))
        #expect(claims["nonce"] == nil)
    }

    @Test func keySurvivesTheKeychainRoundTrip() throws {
        let key = DPoPKey()
        #expect(try DPoPKey(rawRepresentation: key.rawRepresentation).publicJWK == key.publicJWK)
    }

    @Test func sessionExpiryUsesTheMargin() {
        let now = Date(timeIntervalSince1970: 1_000)
        var session = BlueskySession(accessToken: "a", refreshToken: nil, expiresAt: now.addingTimeInterval(30), dpopKey: Data(),
                                     issuer: "i", tokenEndpoint: URL(string: "https://x")!, revocationEndpoint: nil)
        #expect(session.expires(within: 60, from: now))
        session.expiresAt = now.addingTimeInterval(600)
        #expect(!session.expires(within: 60, from: now))
        session.expiresAt = nil
        #expect(!session.expires(within: 60, from: now))
    }
}

// MARK: - BlueskySessionRenewalTests

/// The app and the Share Extension renewing one session.
///
/// Each process has its own connector, and both share the session and the
/// lock file, as the two processes share the app group Keychain and
/// container. Two connectors over one store stand for the two processes:
/// their in-process refresh tasks are separate, so only the file lock keeps
/// them from presenting the same refresh token twice.
@MainActor
struct BlueskySessionRenewalTests {
    private let account = BlueskyAccount(did: TokenEndpointProtocol.accountDID, handle: "name.bsky.social", displayName: "",
                                         avatarURL: nil, pds: URL(string: "https://pds.example")!)
    /// The fake token endpoint's host, unique to each test, so tests running in parallel count apart.
    private let tokenHost = "\(UUID().uuidString.lowercased()).token.test"
    /// The folder of the store's files and its lock file.
    private let folder = FileManager.default.temporaryDirectory.appending(path: "musiccloud-tests-bluesky-\(UUID().uuidString)")

    /// A session whose access token has ended, holding the refresh token the fake endpoint accepts first.
    private var expiredSession: BlueskySession {
        BlueskySession(accessToken: "expired", refreshToken: "refresh-0", expiresAt: .now.addingTimeInterval(-10),
                       dpopKey: DPoPKey().rawRepresentation, issuer: "https://\(tokenHost)",
                       tokenEndpoint: URL(string: "https://\(tokenHost)/oauth/token")!, revocationEndpoint: nil)
    }

    /// A store in ``folder`` holding ``expiredSession`` for ``account``.
    private func makeStore() throws -> SocialAccountStore {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let store = SocialAccountStore(directory: folder, keychain: nil)
        store.add(account, session: expiredSession)
        return store
    }

    /// A connector, standing for one process, whose requests the fake token endpoint answers.
    private func connector(for store: SocialAccountStore) -> BlueskyConnector {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TokenEndpointProtocol.self]
        return BlueskyConnector(store: store, session: URLSession(configuration: configuration))
    }

    @Test func twoProcessesRenewingAtOnceRefreshOnce() async throws {
        let store = try makeStore()
        defer { try? FileManager.default.removeItem(at: folder) }
        let app = connector(for: store)
        let shareExtension = connector(for: store)

        async let fromApp = app.validSession(for: account)
        async let fromExtension = shareExtension.validSession(for: account)
        let sessions = try await [fromApp, fromExtension]

        #expect(TokenEndpointProtocol.requests(to: tokenHost) == 1)
        #expect(sessions.map(\.accessToken) == ["access-1", "access-1"])
        #expect(store.session(for: account)?.refreshToken == "refresh-1")
    }

    @Test func sessionTheOtherProcessRenewedIsUsedWithoutRefreshing() async throws {
        let store = try makeStore()
        defer { try? FileManager.default.removeItem(at: folder) }
        let shareExtension = connector(for: store)
        var renewedByApp = expiredSession
        renewedByApp.accessToken = "renewed-by-app"
        renewedByApp.refreshToken = "refresh-from-app"
        renewedByApp.expiresAt = .now.addingTimeInterval(3600)

        // The app holds the lock while it renews; the extension meanwhile finds
        // the expired session and waits for the lock.
        let lock = try #require(store.blueskySessionLock)
        let account = account
        let renewed = renewedByApp
        let waiting = try await lock.withLock {
            let waiting = Task { try await shareExtension.validSession(for: account) }
            try await Task.sleep(for: .milliseconds(200))
            await store.setSession(renewed, for: account)
            return waiting
        }
        let session = try await waiting.value

        #expect(session.accessToken == "renewed-by-app")
        #expect(TokenEndpointProtocol.requests(to: tokenHost) == 0)
    }
}

// MARK: - SessionFileLockTests

/// The lock's background activity, which iOS can end before the work under the lock is done.
struct SessionFileLockTests {
    @Test func expiredActivityCancelsTheWorkAndReleasesTheLock() async throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "musiccloud-tests-lock-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let url = folder.appending(path: "test.lock")
        // An activity the system ends 300 ms after it started, as iOS does before suspending the process.
        let lock = SessionFileLock(url: url) { _, block in
            DispatchQueue.global().async { block(false) }
            DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(300)) { block(true) }
        }

        let started = ContinuousClock.now
        await #expect(throws: CancellationError.self) {
            try await lock.withLock { try await Task.sleep(for: .seconds(5)) }
        }
        #expect(ContinuousClock.now - started < .seconds(2))
        #expect(isUnlocked(url))
    }

    /// Whether another holder could take the lock on `url` right now.
    private func isUnlocked(_ url: URL) -> Bool {
        let descriptor = open(url.path(percentEncoded: false), O_RDWR)
        guard descriptor >= 0 else { return false }
        defer { close(descriptor) }
        return flock(descriptor, LOCK_EX | LOCK_NB) == 0
    }
}

// MARK: - TokenEndpointProtocol

/// A Bluesky token endpoint that rotates the refresh token, as Bluesky does.
///
/// It accepts only the refresh token it issued last, starting with
/// `refresh-0`, and answers with `access-N` and `refresh-N`. Any other
/// refresh token is refused with `invalid_grant`. State is kept per host, so
/// each test uses a host of its own.
private final class TokenEndpointProtocol: URLProtocol {
    /// The DID the endpoint names as the token's subject.
    static let accountDID = "did:plc:renewal"

    /// Requests and renewals per host.
    private struct Counts {
        var requests = 0
        var renewals = 0
    }

    private static let counts = Mutex<[String: Counts]>([:])

    /// How many refresh requests reached `host`, accepted or refused.
    static func requests(to host: String) -> Int {
        counts.withLock { $0[host]?.requests ?? 0 }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let host = url.host() else { return }
        let presented = Self.formValue("refresh_token", in: request)
        let issued: Int? = Self.counts.withLock { counts in
            var current = counts[host, default: Counts()]
            current.requests += 1
            defer { counts[host] = current }
            guard presented == "refresh-\(current.renewals)" else { return nil }
            current.renewals += 1
            return current.renewals
        }
        let status: Int
        let json: String
        if let issued {
            status = 200
            json = #"{"access_token":"access-\#(issued)","refresh_token":"refresh-\#(issued)","expires_in":3600,"sub":"\#(Self.accountDID)","token_type":"DPoP"}"#
        } else {
            status = 400
            json = #"{"error":"invalid_grant"}"#
        }
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil,
                                             headerFields: ["Content-Type": "application/json"]) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    /// The value of `name` in the request's form body, which URLSession hands over as a stream.
    private static func formValue(_ name: String, in request: URLRequest) -> String? {
        var body = request.httpBody ?? Data()
        if body.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                body.append(buffer, count: count)
            }
        }
        let form = String(data: body, encoding: .utf8) ?? ""
        for pair in form.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            if parts.first == name {
                return parts.count > 1 ? parts[1].removingPercentEncoding : ""
            }
        }
        return nil
    }
}
