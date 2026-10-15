//
//  ConnectAccountModel.swift
//  musiccloud
//

import Foundation
import Observation

// MARK: - ConnectAccountModel

/// The state of the sheet that connects an account: the input, whether a
/// sign-in is running, and the message of the last failure.
///
/// The macOS pane and the iOS screen draw their sheets differently, and both
/// keep this state here, so they accept the same input and react to a failed
/// or cancelled sign-in alike.
@MainActor
@Observable
final class ConnectAccountModel {
    /// Signs in the account the input names, as ``SocialService/connect(_:)`` does.
    typealias Connect = @MainActor (String) async throws -> Void

    /// The service the account is connected for.
    let service: SocialService

    /// The server or handle the user typed.
    ///
    /// Changing it clears ``errorMessage``, because a message belongs to the
    /// input it was about.
    var input = "" {
        didSet {
            if input != oldValue {
                errorMessage = nil
            }
        }
    }

    /// Whether a sign-in is running. The field and the Connect button wait meanwhile.
    private(set) var isWorking = false

    /// Why the last sign-in failed, shown below the field.
    private(set) var errorMessage: String?

    @ObservationIgnored private let performConnect: Connect

    /// Creates the state for connecting an account of `service`.
    ///
    /// - Parameters:
    ///   - service: The service the account is connected for.
    ///   - connect: Signs in the account the input names; `nil` uses ``SocialService/connect(_:)``.
    ///     Tests pass their own, so no browser sheet opens.
    init(service: SocialService, connect: Connect? = nil) {
        self.service = service
        performConnect = connect ?? { input in try await service.connect(input) }
    }

    /// The end of the handle shown beside the field; see ``SocialService/fixedSuffix(for:)``.
    var fixedSuffix: String? {
        service.fixedSuffix(for: input)
    }

    /// Whether the Connect button is enabled: nothing is running and the input is not blank.
    var canConnect: Bool {
        !isWorking && !input.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Signs in the account the input names.
    ///
    /// A cancelled sign-in, which is the user closing the browser sheet,
    /// leaves the input as it was and shows no message. Any other failure
    /// becomes ``errorMessage``.
    ///
    /// - Returns: Whether the account is connected, so the sheet can close.
    func connect() async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            try await performConnect(input)
            return true
        } catch is CancellationError {
            return false
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
