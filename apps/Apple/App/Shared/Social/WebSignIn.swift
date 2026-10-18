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
@MainActor final class WebSignIn: NSObject {
    /// Kept alive while the sheet is open; the system releases it otherwise.
    private var session: ASWebAuthenticationSession?

    #if os(iOS)
    /// The window scenes the sheet can appear in.
    ///
    /// The iOS app sets it at launch from `UIApplication.shared`. The Share
    /// Extension compiles this file as well, for the connectors it posts
    /// with, and may not use `UIApplication.shared`; it never signs in, so
    /// it keeps the empty default.
    static var windowScenes: () -> [UIWindowScene] = { [] }
    #endif

    /// Opens `url` and returns the URL the service redirected to.
    ///
    /// - Parameters:
    ///   - url: The service's authorization page.
    ///   - callbackScheme: The scheme of the redirect URI that ends the sign-in.
    /// - Throws: `CancellationError` when the user closes the sheet, or the system's error.
    ///   On iOS without a window scene that is `ASWebAuthenticationSessionError.presentationContextInvalid`,
    ///   the error the system reports for a sheet that has nowhere to appear.
    func signIn(at url: URL, callbackScheme: String) async throws -> URL {
        #if os(iOS)
        guard Self.presentationScene != nil
        else {
            throw ASWebAuthenticationSessionError(.presentationContextInvalid)
        }
        #endif
        return try await withCheckedThrowingContinuation { continuation in
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
            let session = ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme), completionHandler: completion)
            session.presentationContextProvider = self
            self.session = session
            session.start()
        }
    }

    #if os(iOS)
    /// The scene the sheet appears in: the one in the foreground and active,
    /// or else any window scene the app has.
    private static var presentationScene: UIWindowScene? {
        let scenes = windowScenes()
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }
    #endif
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension WebSignIn: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            #if os(macOS)
            NSApp.keyWindow ?? ASPresentationAnchor()
            #else
            // signIn(at:callbackScheme:) throws before it starts a session
            // when the app has no window scene, so one is here.
            guard let scene = Self.presentationScene
            else {
                preconditionFailure("A sign-in session started without a window scene")
            }
            return scene.keyWindow ?? UIWindow(windowScene: scene)
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
