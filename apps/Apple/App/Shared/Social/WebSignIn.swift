//
//  WebSignIn.swift
//  musiccloud
//

import AuthenticationServices
import Foundation

// MARK: - WebSignIn

/// Shows a service's sign-in page in the system's browser sheet and waits
/// for the redirect back to the app.
///
/// The page belongs to the service, so the app never sees the password.
/// The sheet shares the browser's cookies, so a user already signed in
/// there only confirms.
@MainActor
final class WebSignIn: NSObject {
    /// Kept alive while the sheet is open; the system releases it otherwise.
    private var session: ASWebAuthenticationSession?

    /// Opens `url` and returns the URL the service redirected to.
    ///
    /// - Parameters:
    ///   - url: The service's authorization page.
    ///   - callbackScheme: The scheme of the redirect URI that ends the sign-in.
    /// - Throws: `CancellationError` when the user closes the sheet, or the system's error.
    func signIn(at url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let completion: ASWebAuthenticationSession.CompletionHandler = { [weak self] callback, error in
                Task { @MainActor in self?.session = nil }
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else {
                    continuation.resume(throwing: error ?? URLError(.badServerResponse))
                }
            }
            let session: ASWebAuthenticationSession
            if #available(iOS 17.4, macOS 14.4, *) {
                session = ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme), completionHandler: completion)
            } else {
                session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme, completionHandler: completion)
            }
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension WebSignIn: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            #if os(macOS)
            NSApp.keyWindow ?? ASPresentationAnchor()
            #else
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
            #endif
        }
    }
}

extension URL {
    /// The value of the query item `name`, as an OAuth redirect carries `code` and `state`.
    func queryValue(_ name: String) -> String? {
        URLComponents(url: self, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == name }?.value
    }
}
