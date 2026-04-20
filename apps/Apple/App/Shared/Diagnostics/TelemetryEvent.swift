//
//  TelemetryEvent.swift
//  musiccloud
//
//  Created by Frank Gregor on 20.04.26.
//

import Foundation
#if canImport(UIKit)
import UIKit
#endif

// MARK: - TelemetryEvent

/// Structured error event shipped to the backend's
/// `/api/v1/telemetry/app-error` endpoint.
///
/// Mirrors the server-side JSON schema one-to-one. Keep the two in sync
/// when adding fields: the backend rejects unknown properties.
struct TelemetryEvent: Codable {

    let eventType: String
    let eventTime: Date
    let installId: String
    let appVersion: String
    let buildNumber: String
    let platform: String
    let osVersion: String
    let deviceModel: String
    let locale: String
    let sourceUrl: String?
    let service: String?
    let errorKind: String
    let httpStatus: Int?
    let message: String

    /// Factory for a failure to resolve a user-submitted URL. `sourceUrl`
    /// is the URL the tester pasted; `errorKind` is a short code from the
    /// API error mapper (e.g. `RESOLVE_FAILED`, `RATE_LIMITED`).
    static func resolveError(
        sourceUrl: String?,
        service: String? = nil,
        errorKind: String,
        httpStatus: Int? = nil,
        message: String
    ) -> TelemetryEvent {
        TelemetryEvent(
            eventType: "resolve_error",
            eventTime: Date(),
            installId: InstallID.value,
            appVersion: Self.appVersion,
            buildNumber: Self.buildNumber,
            platform: Self.platform,
            osVersion: Self.osVersion,
            deviceModel: Self.deviceModel,
            locale: Locale.current.identifier,
            sourceUrl: sourceUrl,
            service: service,
            errorKind: errorKind,
            httpStatus: httpStatus,
            message: message
        )
    }

    /// Factory for transport-level failures (no HTTP response, DNS,
    /// TLS, timeout). `errorKind` is typically `NETWORK_TIMEOUT` or
    /// `NETWORK_OFFLINE`.
    static func networkError(
        sourceUrl: String?,
        errorKind: String,
        message: String
    ) -> TelemetryEvent {
        TelemetryEvent(
            eventType: "network_error",
            eventTime: Date(),
            installId: InstallID.value,
            appVersion: Self.appVersion,
            buildNumber: Self.buildNumber,
            platform: Self.platform,
            osVersion: Self.osVersion,
            deviceModel: Self.deviceModel,
            locale: Locale.current.identifier,
            sourceUrl: sourceUrl,
            service: nil,
            errorKind: errorKind,
            httpStatus: nil,
            message: message
        )
    }

    // MARK: Device / bundle context

    private static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    }

    private static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"
    }

    private static var platform: String {
        #if os(macOS)
        return "macos"
        #else
        return "ios"
        #endif
    }

    private static var osVersion: String {
        ProcessInfo.processInfo.operatingSystemVersionString
    }

    /// Hardware identifier like `"iPhone15,2"` / `"Mac14,7"`. Falls back
    /// to `ProcessInfo.machineHardwareName` via `uname(3)` when the
    /// higher-level API is unavailable.
    private static var deviceModel: String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let mirror = Mirror(reflecting: systemInfo.machine)
        return mirror.children.reduce(into: "") { partial, element in
            if let value = element.value as? Int8, value != 0 {
                partial.append(Character(UnicodeScalar(UInt8(value))))
            }
        }
    }
}
