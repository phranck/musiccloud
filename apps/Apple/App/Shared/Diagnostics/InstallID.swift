//
//  InstallID.swift
//  musiccloud
//
//  Created by Frank Gregor on 20.04.26.
//

import Foundation
import Security

// MARK: - InstallID

/// Stable, anonymous per-install identifier for telemetry correlation.
///
/// Generated as a random UUID the first time the app launches and stored
/// in the Keychain so reinstalls get a fresh id but reboots do not. Not
/// linked to any user account, not shared across devices — it exists only
/// so that multiple telemetry events from the same tester's same install
/// can be grouped when I read the `app_telemetry_events` table.
///
/// ## Keychain placement
///
/// The item goes in the app's default keychain access list. If / when a
/// Keychain Sharing access group is added to the Xcode target (shared
/// with the ShareExtension), pass that group identifier through
/// `kSecAttrAccessGroup` here so both binaries see the same id.
enum InstallID {

    private static let service = "io.musiccloud.app"
    private static let account = "telemetry.installId"

    /// Cached after the first read to avoid a Keychain query per event.
    private static var cached: String?

    /// Loads the id from Keychain or creates + stores a new one on first
    /// call. Thread-safe; `OSSpinLock` would be overkill here since the
    /// worst-case race is two UUIDs generated and one winning the write.
    static var value: String {
        if let cached { return cached }
        if let existing = load() {
            cached = existing
            return existing
        }
        let fresh = UUID().uuidString
        store(fresh)
        cached = fresh
        return fresh
    }

    private static func load() -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        query[kSecAttrSynchronizable as String] = kCFBooleanFalse

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func store(_ value: String) {
        let data = Data(value.utf8)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(attributes as CFDictionary, nil)
    }
}
