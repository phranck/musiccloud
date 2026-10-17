//
//  BlueskyConnector.swift
//  musiccloud
//

import Foundation

// MARK: - BlueskyConnector

/// Connects a Bluesky account through AT Protocol OAuth and keeps its
/// session usable.
///
/// Connecting walks from the handle to the account's authorization server,
/// pushes the authorization request with PKCE and a DPoP proof, lets the
/// user sign in through ``WebSignIn``, and exchanges the code for tokens.
/// The account the server signed in must be the one the handle names;
/// anything else is refused. Every token request carries a DPoP proof from
/// a key made for this sign-in, so the tokens are worthless elsewhere.
@MainActor final class BlueskyConnector {
    private let store: SocialAccountStore
    private let session: URLSession
    private let webSignIn = WebSignIn()
    /// The latest `DPoP-Nonce` per server origin. The authorization server
    /// and the PDS hand out separate nonces, and a request with another
    /// server's nonce is refused.
    private var nonces: [String: String] = [:]
    /// Refreshes in flight per account in this process. A refresh token works
    /// once, so two requests renewing the same session would sign the account
    /// out. The store's ``SocialAccountStore/blueskySessionLock`` does the same
    /// between this process and the other one.
    private var refreshes: [BlueskyAccount.ID: Task<BlueskySession, Error>] = [:]

    /// Renew an access token this long before it ends.
    private static let refreshMargin: TimeInterval = 60

    init(store: SocialAccountStore, session: URLSession = .shared) {
        self.store = store
        self.session = session
    }

    /// Signs in the account `handleInput` names and stores it.
    ///
    /// - Parameter handleInput: A handle such as `musiccloud.io` or `@name.bsky.social`.
    /// - Returns: The connected account.
    /// - Throws: ``SocialServiceError``, `CancellationError` when the user closes the sheet, or a network error.
    @discardableResult func connect(handleInput: String) async throws -> BlueskyAccount {
        guard let handle = BlueskyAPI.handle(from: handleInput) else {
            // The code points of what a handle cannot contain show the cause of
            // a rejection the user cannot see, such as an invisible character.
            let unexpected = handleInput.lowercased().unicodeScalars.filter { !BlueskyAPI.isHandleCharacter($0) && $0 != "@" }.map {
                String(format: "U+%04X", $0.value)
            }
            AppLogger.api.notice("Bluesky handle rejected, unexpected characters: \(unexpected.joined(separator: " "), privacy: .public)")
            if !unexpected.isEmpty {
                throw SocialServiceError.invalidInput(
                    String(localized: "The handle contains characters that are not allowed: \(unexpected.joined(separator: " "))")
                )
            }
            throw SocialServiceError.invalidInput(String(localized: "Enter your Bluesky handle, such as name.bsky.social."))
        }
        let did = try await resolveDID(of: handle)
        guard let documentURL = BlueskyAPI.didDocumentURL(did: did) else { throw SocialServiceError.unexpectedAnswer }
        let document = try await session.decoded(BlueskyDIDDocument.self, for: URLRequest(url: documentURL))
        guard document.id == did, document.confirms(handle: handle), let pds = document.pdsEndpoint else {
            throw SocialServiceError.unexpectedAnswer
        }
        let server = try await authorizationServer(of: pds)

        let key = DPoPKey()
        let verifier = OAuthSupport.makeCodeVerifier()
        let state = UUID().uuidString
        let (parBody, _) = try await send(
            BlueskyAPI.pushedAuthorizationRequest(
                endpoint: server.pushedAuthorizationRequestEndpoint,
                state: state,
                codeChallenge: OAuthSupport.codeChallenge(for: verifier),
                loginHint: handle
            ),
            key: key
        )
        guard let pushed = try? BlueskyAPI.decoder.decode(BlueskyPushedRequest.self, from: parBody) else {
            throw SocialServiceError.unexpectedAnswer
        }

        let callback = try await webSignIn.signIn(
            at: BlueskyAPI.authorizeURL(endpoint: server.authorizationEndpoint, requestURI: pushed.requestUri),
            callbackScheme: BlueskyAPI.callbackScheme
        )
        // `iss` names the server that answered; a callback from another one is refused.
        guard callback.queryValue("state") == state, callback.queryValue("iss") == server.issuer, let code = callback.queryValue("code")
        else { throw SocialServiceError.missingCode }

        let (tokenBody, _) = try await send(
            BlueskyAPI.tokenRequest(endpoint: server.tokenEndpoint, code: code, codeVerifier: verifier),
            key: key
        )
        guard let tokens = try? BlueskyAPI.decoder.decode(BlueskyTokenResponse.self, from: tokenBody),
            tokens.scope?.split(separator: " ").contains("atproto") == true
        else { throw SocialServiceError.unexpectedAnswer }
        guard tokens.sub == did else { throw SocialServiceError.accountMismatch }

        let profile = try? await session.decoded(BlueskyProfile.self, for: URLRequest(url: BlueskyAPI.profileURL(did: did)))
        let account = BlueskyAccount(
            did: did,
            handle: profile?.handle ?? handle,
            displayName: profile?.displayName ?? "",
            avatarURL: profile?.avatar,
            pds: pds
        )
        store.add(
            account,
            session: BlueskySession(
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresIn.map { Date.now.addingTimeInterval(TimeInterval($0)) },
                dpopKey: key.rawRepresentation,
                issuer: server.issuer,
                tokenEndpoint: server.tokenEndpoint,
                revocationEndpoint: server.revocationEndpoint
            )
        )
        return account
    }

    /// Revokes the account's tokens where the server offers it, and removes the account.
    ///
    /// The account is removed even when the server cannot be reached,
    /// because the user asked for it to be gone from this device.
    func disconnect(_ account: BlueskyAccount) async {
        if let stored = store.session(for: account), let endpoint = stored.revocationEndpoint,
            let key = try? DPoPKey(rawRepresentation: stored.dpopKey)
        {
            for token in [stored.refreshToken, stored.accessToken].compactMap(\.self) {
                do { _ = try await send(BlueskyAPI.revokeRequest(endpoint: endpoint, token: token), key: key) } catch {
                    AppLogger.api.error("Revoking a token of \(account.displayHandle) failed: \(error.localizedDescription)")
                }
            }
        }
        store.remove(account)
    }

    /// The session of `account`, renewed first when its access token is about to end.
    ///
    /// A session that is still valid is returned without taking any lock.
    /// Renewals within this process share one task, and the task renews
    /// under the store's session lock, so the app and the Share Extension
    /// never present the same rotating refresh token twice.
    ///
    /// - Throws: When the session is gone or the server refuses to renew it,
    ///   in which case the account has to be connected again.
    func validSession(for account: BlueskyAccount) async throws -> BlueskySession {
        guard let stored = store.session(for: account) else { throw SocialServiceError.signedOut }
        guard stored.expires(within: Self.refreshMargin) else { return stored }
        if let running = refreshes[account.id] { return try await running.value }
        let refresh = Task { try await self.renewUnderLock(for: account) }
        refreshes[account.id] = refresh
        defer { refreshes[account.id] = nil }
        return try await refresh.value
    }

    /// Posts `markdown` from `account` as plain text, with its links and hashtags as
    /// facets and a preview card for its first link.
    func post(_ markdown: String, from account: BlueskyAccount) async throws {
        let post = PostFormatter.bluesky(fromMarkdown: markdown)
        let card = await linkCard(for: post, from: account)
        let request = BlueskyAPI.createPostRequest(pds: account.pds, did: account.did, post: post, createdAt: .now, card: card)
        _ = try await sendAuthorized(request, for: account)
    }

    /// The preview card for the first link in `post`, from that page's Open Graph tags.
    ///
    /// Bluesky shows no preview unless the post brings one. The card is best
    /// effort: a page or image that cannot be fetched leaves the post without
    /// a card, or the card without its image, rather than stopping the post.
    func linkCard(for post: BlueskyPostText, from account: BlueskyAccount) async -> BlueskyExternalEmbed? {
        guard
            let uri = post.facets.lazy.compactMap({ facet -> String? in
                if case .link(let uri) = facet.feature { return uri } else { return nil }
            }).first, let page = URL(string: uri),
            let answer = try? await session.checkedData(for: BlueskyAPI.linkPreviewRequest(url: page)),
            let html = String(data: answer.0, encoding: .utf8) ?? String(data: answer.0, encoding: .isoLatin1)
        else { return nil }

        let graph = OpenGraph(html: html, page: answer.1.url ?? page)
        guard graph.title != nil || graph.description != nil || graph.image != nil else { return nil }
        return BlueskyExternalEmbed(
            external: .init(
                uri: uri,
                title: graph.title ?? "",
                description: graph.description ?? "",
                thumb: await thumbnail(at: graph.image, for: account)
            )
        )
    }

    /// The image at `url` uploaded to the account's PDS, or `nil` when it cannot be fetched or is too large.
    func thumbnail(at url: URL?, for account: BlueskyAccount) async -> BlueskyBlob? {
        guard let url, let answer = try? await session.checkedData(for: URLRequest(url: url)),
            answer.0.count <= BlueskyAPI.thumbnailByteLimit
        else { return nil }
        let data = answer.0
        let mimeType = answer.1.mimeType.flatMap { $0.hasPrefix("image/") ? $0 : nil } ?? "image/jpeg"
        do {
            let (body, _) = try await sendAuthorized(
                BlueskyAPI.uploadBlobRequest(pds: account.pds, data: data, mimeType: mimeType),
                for: account
            )
            return try JSONDecoder().decode(BlueskyUploadedBlob.self, from: body).blob
        } catch {
            AppLogger.api.error("Uploading a link card image failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// Sends `request` to the account's PDS with its access token and a proof naming that token.
    func sendAuthorized(_ request: URLRequest, for account: BlueskyAccount) async throws -> (Data, HTTPURLResponse) {
        let current = try await validSession(for: account)
        return try await send(request, key: DPoPKey(rawRepresentation: current.dpopKey), accessToken: current.accessToken)
    }
}

// MARK: - Steps

private extension BlueskyConnector {
    /// The DID `handle` names: the handle's own HTTPS answer first, then the
    /// public API, which also knows handles that are verified by DNS.
    func resolveDID(of handle: String) async throws -> String {
        if let url = BlueskyAPI.wellKnownDIDURL(handle: handle), let answer = try? await session.checkedData(for: URLRequest(url: url)),
            let text = String(data: answer.0, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), text.hasPrefix("did:")
        {
            return text
        }
        do {
            return try await session.decoded(BlueskyResolvedHandle.self, for: URLRequest(url: BlueskyAPI.resolveHandleURL(handle: handle)))
                .did
        } catch SocialServiceError.refused {
            throw SocialServiceError.invalidInput(String(localized: "No Bluesky account has the handle \(handle)."))
        }
    }

    /// The authorization server the PDS names, with its metadata checked to name itself.
    func authorizationServer(of pds: URL) async throws -> BlueskyAuthorizationServer {
        let resource = try await session.decoded(
            BlueskyProtectedResource.self,
            for: URLRequest(url: BlueskyAPI.protectedResourceURL(pds: pds)),
            decoder: BlueskyAPI.decoder
        )
        guard let issuerText = resource.authorizationServers.first, let issuer = URL(string: issuerText) else {
            throw SocialServiceError.unexpectedAnswer
        }
        let server = try await session.decoded(
            BlueskyAuthorizationServer.self,
            for: URLRequest(url: BlueskyAPI.authorizationServerMetadataURL(issuer: issuer)),
            decoder: BlueskyAPI.decoder
        )
        guard server.issuer == issuerText else { throw SocialServiceError.unexpectedAnswer }
        return server
    }

    /// Renews the session of `account` while holding the store's session lock.
    ///
    /// The app and the Share Extension each renew on their own, and Bluesky
    /// rotates the refresh token every time, so a token one process used is
    /// refused for the other. Holding the lock makes the second process wait
    /// until the first has stored its new session. A store kept in memory
    /// has no lock and is only ever used by one process.
    ///
    /// - Throws: `CancellationError` when iOS ends the background activity the
    ///   lock is held in, so the next request renews again.
    func renewUnderLock(for account: BlueskyAccount) async throws -> BlueskySession {
        guard let lock = store.blueskySessionLock else { return try await renewIfStillDue(account) }
        return try await lock.withLock { try await self.renewIfStillDue(account) }
    }

    /// The stored session of `account`, read again and renewed only when it is still about to end.
    ///
    /// The session is read again because the other process may have renewed
    /// it while this one waited for the lock. Its session is then valid and
    /// is used as it is, since the refresh token read before has been used up.
    func renewIfStillDue(_ account: BlueskyAccount) async throws -> BlueskySession {
        guard let stored = store.session(for: account) else { throw SocialServiceError.signedOut }
        guard stored.expires(within: Self.refreshMargin) else { return stored }
        return try await refresh(stored, for: account)
    }

    /// Renews `stored` with its refresh token, which the server replaces with a new one.
    func refresh(_ stored: BlueskySession, for account: BlueskyAccount) async throws -> BlueskySession {
        guard let refreshToken = stored.refreshToken else { throw SocialServiceError.signedOut }
        let key = try DPoPKey(rawRepresentation: stored.dpopKey)
        let (body, _) = try await send(BlueskyAPI.refreshRequest(endpoint: stored.tokenEndpoint, refreshToken: refreshToken), key: key)
        guard let tokens = try? BlueskyAPI.decoder.decode(BlueskyTokenResponse.self, from: body) else {
            throw SocialServiceError.unexpectedAnswer
        }
        guard tokens.sub == account.did else { throw SocialServiceError.accountMismatch }
        var renewed = stored
        renewed.accessToken = tokens.accessToken
        renewed.refreshToken = tokens.refreshToken ?? refreshToken
        renewed.expiresAt = tokens.expiresIn.map { Date.now.addingTimeInterval(TimeInterval($0)) }
        store.setSession(renewed, for: account)
        return renewed
    }

    /// Sends `request` with a DPoP proof, and once more with the server's new
    /// nonce when it refuses the first for lacking one.
    func send(_ request: URLRequest, key: DPoPKey, accessToken: String? = nil) async throws -> (Data, HTTPURLResponse) {
        guard let url = request.url else { throw SocialServiceError.unexpectedAnswer }
        let origin = Self.origin(of: url)
        var lastStatus = 0
        for _ in 0..<2 {
            var signed = request
            signed.setValue(
                try key.proof(method: request.httpMethod ?? "GET", url: url, nonce: nonces[origin], accessToken: accessToken),
                forHTTPHeaderField: "DPoP"
            )
            if let accessToken { signed.setValue("DPoP \(accessToken)", forHTTPHeaderField: "Authorization") }
            let (body, response) = try await session.data(for: signed)
            guard let http = response as? HTTPURLResponse else { throw SocialServiceError.unexpectedAnswer }
            let previous = nonces[origin]
            if let nonce = http.value(forHTTPHeaderField: "DPoP-Nonce") { nonces[origin] = nonce }
            if (200..<300).contains(http.statusCode) { return (body, http) }
            lastStatus = http.statusCode
            guard Self.asksForNonce(http, body: body), nonces[origin] != previous else {
                // XRPC and OAuth errors say in the body what was wrong, such as `InvalidRequest`.
                let reason = String(data: body.prefix(500), encoding: .utf8) ?? ""
                AppLogger.api.error("Bluesky refused \(url.path, privacy: .public) with \(http.statusCode): \(reason, privacy: .public)")
                break
            }
        }
        throw SocialServiceError.refused(status: lastStatus)
    }

    /// Whether the server refused because the proof lacked its current nonce:
    /// `use_dpop_nonce` in the JSON body from an authorization server, or in
    /// `WWW-Authenticate` from a PDS.
    static func asksForNonce(_ response: HTTPURLResponse, body: Data) -> Bool {
        guard response.statusCode == 400 || response.statusCode == 401 else { return false }
        if response.value(forHTTPHeaderField: "WWW-Authenticate")?.contains("use_dpop_nonce") == true { return true }
        let error = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        return error?["error"] as? String == "use_dpop_nonce"
    }

    static func origin(of url: URL) -> String { "\(url.scheme ?? "https")://\(url.host() ?? "")\(url.port.map { ":\($0)" } ?? "")" }
}
