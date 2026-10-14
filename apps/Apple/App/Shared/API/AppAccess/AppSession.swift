//
//  AppSession.swift
//  musiccloud
//

import CryptoKit
import DeviceCheck
import Foundation

// MARK: - AppSession

/// Holds the sessions that let this app convert without a rate limit.
///
/// The first time a backend is asked, the app creates an App Attest key in
/// the Secure Enclave, has Apple attest it, and sends the attestation to that
/// backend, which answers with a session token valid for seven days. A day
/// before it expires, the app renews it with an assertion signed by the same
/// key. Concurrent callers share one attestation or renewal.
///
/// Keys and tokens belong to one backend each: the local backend and
/// production keep separate key tables and sign with separate secrets, and a
/// Debug and a Release build share one Keychain.
///
/// The Share Extension cannot use App Attest
/// ([Apple](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity#Check-for-availability)),
/// so there it only reads the token the app stored. Where no token is
/// available, ``currentToken(for:now:)`` returns `nil` and the caller converts
/// through the public route instead.
actor AppSession {
    static let shared = AppSession()

    /// How long before expiry the app renews its token, in seconds.
    static let renewalMargin: TimeInterval = 24 * 60 * 60

    /// The attestation or renewal running for each backend, keyed by its Keychain account.
    private var pending: [String: Task<AppSessionToken?, Never>] = [:]

    /// A token `backend` accepts, attesting or renewing first where needed.
    ///
    /// - Parameters:
    ///   - backend: The backend that serves the attested routes.
    ///   - now: The current time, injectable for tests.
    /// - Returns: The bearer token, or `nil` when this process has none and cannot get one.
    func currentToken(for backend: URL = MusicCloudAPI.appAccessURL, now: Date = .now) async -> String? {
        // A test run shares the app's Keychain and must not reach Apple or the backend.
        guard !SharedStoreConfiguration.isHostingTests else { return nil }
        let stored = AppSessionStore.token(for: backend)
        if let stored, !Self.needsRenewal(stored, now: now) {
            return stored.value
        }
        let stillValid = stored.flatMap { $0.expiresAt > now ? $0.value : nil }
        guard Self.canAttest else { return stillValid }

        let key = AppSessionStore.account("session", backend)
        if let running = pending[key] {
            return await running.value?.value ?? stillValid
        }
        let task = Task { await establish(with: backend) }
        pending[key] = task
        let fresh = await task.value
        pending[key] = nil
        return fresh?.value ?? stillValid
    }

    /// Gets a session at launch, so the first conversion does not wait for
    /// Apple's attestation, and the Share Extension finds a fresh token.
    func prepare() async {
        _ = await currentToken()
    }

    /// Forgets the token `backend` refused, so the next call renews.
    func invalidate(for backend: URL) {
        AppSessionStore.setToken(nil, for: backend)
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
    func establish(with backend: URL) async -> AppSessionToken? {
        do {
            if let keyId = AppSessionStore.keyId(for: backend) {
                do {
                    return store(try await renew(keyId: keyId, backend: backend), for: backend)
                } catch AppAccessClient.Failure.keyUnknown {
                    AppSessionStore.setKeyId(nil, for: backend)
                } catch AppAccessClient.Failure.proofRejected {
                    AppSessionStore.setKeyId(nil, for: backend)
                }
            }
            return store(try await attestNewKey(backend: backend), for: backend)
        } catch {
            AppLogger.api.error("App session unavailable: \(String(describing: error))")
            return nil
        }
    }

    func store(_ token: AppSessionToken, for backend: URL) -> AppSessionToken {
        AppSessionStore.setToken(token, for: backend)
        return token
    }

    func renew(keyId: String, backend: URL) async throws -> AppSessionToken {
        let challenge = try await AppAccessClient.fetchChallenge(base: backend)
        let assertion = try await DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: Self.clientDataHash(for: challenge))
        let request = try AppAccessClient.sessionRequest(base: backend, keyId: keyId, assertion: assertion, challenge: challenge)
        return try await AppAccessClient.fetchToken(request)
    }

    /// Creates and attests a key. The key id is kept only once the backend
    /// accepted it, because Apple attests a key once and a key the backend
    /// never saw cannot be used again.
    func attestNewKey(backend: URL) async throws -> AppSessionToken {
        let service = DCAppAttestService.shared
        let keyId = try await service.generateKey()
        let challenge = try await AppAccessClient.fetchChallenge(base: backend)
        let attestation = try await service.attestKey(keyId, clientDataHash: Self.clientDataHash(for: challenge))
        let request = try AppAccessClient.attestRequest(base: backend, keyId: keyId, attestation: attestation, challenge: challenge)
        do {
            let token = try await AppAccessClient.fetchToken(request)
            AppSessionStore.setKeyId(keyId, for: backend)
            return token
        } catch AppAccessClient.Failure.keyAlreadyAttested {
            AppSessionStore.setKeyId(keyId, for: backend)
            return try await renew(keyId: keyId, backend: backend)
        }
    }
}
