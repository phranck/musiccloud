import Foundation
import Testing
@testable import musiccloud

// MARK: - AppAccessTests

struct AppAccessTests {
    // swiftlint:disable:next force_unwrapping
    private let base = URL(string: "https://api.musiccloud.io")!

    // MARK: Renewal timing

    @Test func tokenFarFromExpiryIsKept() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let token = AppSessionToken(value: "token", expiresAt: now.addingTimeInterval(AppSession.renewalMargin + 60))
        #expect(!AppSession.needsRenewal(token, now: now))
    }

    @Test func tokenWithinTheMarginIsRenewed() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let token = AppSessionToken(value: "token", expiresAt: now.addingTimeInterval(AppSession.renewalMargin - 60))
        #expect(AppSession.needsRenewal(token, now: now))
    }

    @Test func expiredTokenIsRenewed() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let token = AppSessionToken(value: "token", expiresAt: now.addingTimeInterval(-1))
        #expect(AppSession.needsRenewal(token, now: now))
    }

    // MARK: Client data

    /// The backend hashes the challenge's UTF-8 text, so the app must too.
    @Test func clientDataHashIsSHA256OfTheChallengeText() {
        let hash = AppSession.clientDataHash(for: "abc")
        let hex = hash.map { String(format: "%02x", $0) }.joined()
        #expect(hex == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    // MARK: Requests

    @Test func challengeRequestHasNoBodyAndNoContentType() {
        let request = AppAccessClient.challengeRequest(base: base)
        #expect(request.url?.absoluteString == "https://api.musiccloud.io/api/app/challenge")
        #expect(request.httpMethod == "POST")
        #expect(request.httpBody == nil)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == nil)
    }

    @Test func attestRequestCarriesKeyAttestationAndChallenge() throws {
        let request = try AppAccessClient.attestRequest(base: base, keyId: "key", attestation: Data([1, 2, 3]), challenge: "challenge")
        #expect(request.url?.path() == "/api/app/attest")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        let body = try JSONDecoder().decode([String: String].self, from: try #require(request.httpBody))
        #expect(body == ["keyId": "key", "attestation": "AQID", "challenge": "challenge"])
    }

    @Test func sessionRequestCarriesTheAssertion() throws {
        let request = try AppAccessClient.sessionRequest(base: base, keyId: "key", assertion: Data([4, 5, 6]), challenge: "challenge")
        #expect(request.url?.path() == "/api/app/session")
        let body = try JSONDecoder().decode([String: String].self, from: try #require(request.httpBody))
        #expect(body == ["keyId": "key", "assertion": "BAUG", "challenge": "challenge"])
    }

    @Test func resolveRequestSendsTheTokenAsBearer() throws {
        let request = try AppAccessClient.resolveRequest(base: base, query: "https://open.spotify.com/track/abc", token: "secret")
        #expect(request.url?.absoluteString == "https://api.musiccloud.io/api/app/resolve")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer secret")
        let body = try JSONDecoder().decode([String: String].self, from: try #require(request.httpBody))
        #expect(body == ["query": "https://open.spotify.com/track/abc"])
    }

    // MARK: Answers

    @Test(arguments: [
        ("MC-AUTH-0005", AppAccessClient.Failure.sessionInvalid),
        ("MC-AUTH-0006", .challengeRejected),
        ("MC-AUTH-0007", .proofRejected),
        ("MC-AUTH-0008", .keyUnknown),
        ("MC-REQ-0009", .keyAlreadyAttested),
        ("MC-API-0003", .unavailable),
        ("", .unavailable),
    ])
    func backendCodesMapOntoFailures(_ code: String, _ failure: AppAccessClient.Failure) {
        #expect(AppAccessClient.failure(forCode: code) == failure)
    }

    @Test func sessionTokenDecodesTheBackendsDate() throws {
        let json = #"{"value":"token","expiresAt":"2026-10-21T13:38:54.480Z"}"#
        let token = try JSONDecoder.appSession.decode(AppSessionToken.self, from: Data(json.utf8))
        #expect(token.expiresAt == Date(timeIntervalSince1970: 1_792_589_934.48))
        let roundTrip = try JSONDecoder.appSession.decode(AppSessionToken.self, from: try JSONEncoder.appSession.encode(token))
        #expect(roundTrip == token)
    }

    /// A backend deployed before the attested routes answers this, and the
    /// app then converts through the public route.
    @Test func missingRouteIsRecognized() {
        let body = #"{"error":"MC-RES-0003","errorId":"558073b1","message":"Route not found. (MC-RES-0003)"}"#
        #expect(MusicCloudAPI.isRouteNotFound(Data(body.utf8)))
    }

    /// A link the backend cannot find also answers 404, and that one is shown, not retried.
    @Test func notFoundLinkIsNotAMissingRoute() {
        let body = #"{"error":"MC-RES-0001","errorId":"1","message":"Not found"}"#
        #expect(!MusicCloudAPI.isRouteNotFound(Data(body.utf8)))
        #expect(!MusicCloudAPI.isRouteNotFound(Data("<html>".utf8)))
    }

    // MARK: Keychain scope

    /// A Debug and a Release build share the Keychain, so each backend's
    /// token and key id live under their own account.
    @Test func keychainAccountsDifferPerBackend() throws {
        let local = try #require(URL(string: "http://localhost:4001"))
        let production = MusicCloudAPI.productionAppAccessURL
        #expect(AppSessionStore.account("session-token", local) == "session-token@localhost:4001")
        #expect(AppSessionStore.account("session-token", production) == "session-token@api.musiccloud.io")
    }

    // MARK: Hosts

    @Test func productionSiteUsesTheProductionBackend() {
        #expect(MusicCloudAPI.appAccessURL(forSite: MusicCloudAPI.productionURL) == MusicCloudAPI.productionAppAccessURL)
    }

    /// Without an override a Debug build uses the production backend, like
    /// ``MusicCloudAPI/baseURL``.
    @Test func debugAppAccessURLFallsBackToProduction() {
        #if DEBUG
        guard ProcessInfo.processInfo.environment["MUSICCLOUD_API_URL"] == nil else { return }
        #expect(MusicCloudAPI.appAccessURL == MusicCloudAPI.productionAppAccessURL)
        #endif
    }
}
