//
//  BuildChannel.swift
//  musiccloud
//
//  Created by Frank Gregor on 20.04.26.
//

import Foundation
import os
import StoreKit

// MARK: - BuildChannel

/// How this copy of the app was distributed to the current device.
///
/// Used to gate diagnostics features that must never ship to App Store
/// customers (log export, automatic telemetry POSTs). `DEBUG` builds
/// report as `.debug`. Release builds ask StoreKit for the environment of
/// their `AppTransaction`:
///
/// - `sandbox` or `xcode` → Testflight tester or local Release install
/// - `production` → App Store download
/// - no verified transaction → treated as the App Store, so diagnostics stay off
enum BuildChannel: Sendable {
    case debug
    case testflight
    case appStore

    /// The channel, once ``resolve()`` has finished.
    ///
    /// Until then a Release build reports `.appStore`, so nothing reaches
    /// a customer before the channel is known.
    static var current: BuildChannel {
        #if DEBUG
        .debug
        #else
        resolved.withLock { $0 } ?? .appStore
        #endif
    }

    /// True for every build except the App Store release. The flag is
    /// the single source of truth for "should we expose diagnostics UI
    /// and auto-POST error events?".
    static var diagnosticsEnabled: Bool {
        current != .appStore
    }

    /// Asks StoreKit once how the app was installed. Later calls return at once.
    ///
    /// Called at launch, and by ``TelemetryClient`` before it decides
    /// whether to send, so an event at launch is not dropped for lack of
    /// an answer.
    static func resolve() async {
        #if !DEBUG
        guard resolved.withLock({ $0 }) == nil else { return }
        let channel: BuildChannel
        if case .verified(let transaction)? = try? await AppTransaction.shared {
            channel = transaction.environment == .production ? .appStore : .testflight
        } else {
            channel = .appStore
        }
        resolved.withLock { $0 = channel }
        #endif
    }

    /// The answer from StoreKit, `nil` until ``resolve()`` has one.
    private static let resolved = OSAllocatedUnfairLock<BuildChannel?>(initialState: nil)
}
