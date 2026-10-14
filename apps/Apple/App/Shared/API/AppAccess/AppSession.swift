//
//  AppSession.swift
//  musiccloud
//

import CryptoKit
import DeviceCheck
import Foundation

// MARK: - AppSession

/// Holds the session that lets this app convert without a rate limit.
///
/// The first time it is needed, the app creates an App Attest key in the
/// Secure Enclave, has Apple attest it, and sends the attestation to the
/// backend, which answers with a session token valid for seven days. A day
/// before it expires, the app renews it with an assertion signed by the same
/// key. Concurrent callers share one attestation or renewal.
///
/// The Share Extension cannot use App Attest
/// ([Apple](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity#Check-for-availability)),
/// so there it only reads the token the app stored. Where no token is
/// available, ``currentToken(now:)`` returns `nil` and the caller converts
/// through the public route instead.
actor AppSession {
    static let shared = AppSession()

    /// How long before expiry the app renews its token, in seconds.
    static let renewalMargin: TimeInterval = 24 * 60 * 60

    private var pending: Task<AppSessionToken?, Never>?

    /// A token the backend accepts, attesting or renewing first where needed.
    ///
    /// - Parameter now: The current time, injectable for tests.
    /// - Returns: The bearer token, or `nil` when this process has none and cannot get one.
    func currentToken(now: Date = .now) async -> String? {
        // A test run shares the app's Keychain and must not reach Apple or the backend.
        guard !SharedStoreConfiguration.isHostingTests else { return nil }
        let stored = AppSessionStore.token
        if let stored, !Self.needsRenewal(stored, now: now) {
            return stored.value
        }
        let stillValid = stored.flatMap { $0.expiresAt > now ? $0.value : nil }
        guard Self.canAttest else { return stillValid }

        if let pending {
            return await pending.value?.value ?? stillValid
        }
        let task = Task { await establish() }
        pending = task
        let fresh = await task.value
        pending = nil
        return fresh?.value ?? stillValid
    }

    /// Gets a session at launch, so the first conversion does not wait for
    /// Apple's attestation, and the Share Extension finds a fresh token.
    /// Does nothing in a test run, which must not reach Apple or the backend.
    func prepare() async {
        guard !SharedStoreConfiguration.isHostingTests else { return }
        _ = await currentToken()
    }

    /// Forgets the token after the backend refused it, so the next call renews.
    func invalidate() {
        AppSessionStore.token = nil
    }

    /// Whether a token is close enough to expiry to be renewed.
    static func needsRenewal(_ token: AppSessionToken, now: Date) -> Bool {
        token.expiresAt.timeIntervalSince(now) < renewalMargin
    }

    /// The hash App Attest signs: SHA-256 of the challenge's UTF-8 text,
    /// which is how the backend reconstructs it.
    static func clientDataHash(for challenge: String) -> Data {
        Data(SHA256.hash(data: Data(challenge.utf8)))
    }

    /// App Attest works in the app itself, not in the Share Extension and
    /// not on hardware without a Secure Enclave.
    private static var canAttest: Bool {
        Bundle.main.bundleURL.pathExtension != "appex" && DCAppAttestService.shared.isSupported
    }
}

// MARK: - Attestation and renewal

private extension AppSession {
    /// Renews with the stored key, or attests a new one when there is none
    /// or the backend no longer accepts it. Stores what it gets.
    func establish() async -> AppSessionToken? {
        let base = MusicCloudAPI.appAccessURL
        do {
            if let keyId = AppSessionStore.keyId {
                do {
                    return store(try await renew(keyId: keyId, base: base))
                } catch AppAccessClient.Failure.keyUnknown {
                    AppSessionStore.keyId = nil
                } catch AppAccessClient.Failure.proofRejected {
                    AppSessionStore.keyId = nil
                }
            }
            return store(try await attestNewKey(base: base))
        } catch {
            AppLogger.api.error("App session unavailable: \(String(describing: error))")
            return nil
        }
    }

    func store(_ token: AppSessionToken) -> AppSessionToken {
        AppSessionStore.token = token
        return token
    }

    func renew(keyId: String, base: URL) async throws -> AppSessionToken {
        let challenge = try await AppAccessClient.fetchChallenge(base: base)
        let assertion = try await DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: Self.clientDataHash(for: challenge))
        let request = try AppAccessClient.sessionRequest(base: base, keyId: keyId, assertion: assertion, challenge: challenge)
        return try await AppAccessClient.fetchToken(request)
    }

    /// Creates and attests a key. The key id is kept only once the backend
    /// accepted it, because Apple attests a key once and a key the backend
    /// never saw cannot be used again.
    func attestNewKey(base: URL) async throws -> AppSessionToken {
        let service = DCAppAttestService.shared
        let keyId = try await service.generateKey()
        let challenge = try await AppAccessClient.fetchChallenge(base: base)
        let attestation = try await service.attestKey(keyId, clientDataHash: Self.clientDataHash(for: challenge))
        let request = try AppAccessClient.attestRequest(base: base, keyId: keyId, attestation: attestation, challenge: challenge)
        do {
            let token = try await AppAccessClient.fetchToken(request)
            AppSessionStore.keyId = keyId
            return token
        } catch AppAccessClient.Failure.keyAlreadyAttested {
            AppSessionStore.keyId = keyId
            return try await renew(keyId: keyId, base: base)
        }
    }
}
