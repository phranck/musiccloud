//
//  BuildChannel.swift
//  musiccloud
//
//  Created by Frank Gregor on 20.04.26.
//

import Foundation

// MARK: - BuildChannel

/// How this copy of the app was distributed to the current device.
///
/// Used to gate diagnostics features that must never ship to App Store
/// customers (log export, automatic telemetry POSTs). `DEBUG` builds
/// report as `.debug`; Release archives are inspected at launch by
/// looking at the receipt filename Apple places in the bundle:
///
/// - `sandboxReceipt` → Testflight tester or local Release install
/// - `receipt` → App Store download
/// - `nil` → unsigned build (e.g. simulator with no receipt)
enum BuildChannel {
    case debug
    case testflight
    case appStore

    /// Computed once at launch — the receipt file does not change for
    /// the lifetime of the process.
    static let current: BuildChannel = {
        #if DEBUG
        return .debug
        #else
        let receiptName = Bundle.main.appStoreReceiptURL?.lastPathComponent
        return receiptName == "sandboxReceipt" ? .testflight : .appStore
        #endif
    }()

    /// True for every build except the App Store release. The flag is
    /// the single source of truth for "should we expose diagnostics UI
    /// and auto-POST error events?".
    static var diagnosticsEnabled: Bool {
        current != .appStore
    }
}
