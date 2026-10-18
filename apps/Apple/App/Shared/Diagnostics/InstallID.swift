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
/// in the Keychain, so it survives a reboot. It is not linked to any user
/// account. The Keychain item is `ThisDeviceOnly`, so it never moves to
/// another device through a backup or iCloud Keychain. It exists only so
/// that several telemetry events from the same install can be grouped in
/// the `app_telemetry_events` table.
///
/// ## Keychain placement
///
/// The item goes in the app's default keychain access list. If a Keychain
/// Sharing access group is added to the Xcode target (shared with the
/// ShareExtension), pass that group identifier through
/// `kSecAttrAccessGroup` here so both binaries see the same id.
enum InstallID {

    private static let service = "io.musiccloud.app"
    private static let account = "telemetry.installId"

    /// The id, read from the Keychain or created there on first use.
    ///
    /// A `static let` is initialized exactly once, even when several
    /// threads ask at the same time, so every event of one launch carries
    /// the same id.
    static let value: String = load() ?? createAndStore()

    /// Creates a new id and stores it. When another process stored one in
    /// the meantime, that one wins, so the app and its extension agree.
    private static func createAndStore() -> String {
        let fresh = UUID().uuidString
        if store(fresh) == errSecDuplicateItem, let existing = load() { return existing }
        return fresh
    }

    private static func load() -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
            kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        query[kSecAttrSynchronizable as String] = kCFBooleanFalse

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard
            status == errSecSuccess,
            let data = item as? Data
        else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult private static func store(_ value: String) -> OSStatus {
        let data = Data(value.utf8)
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
            kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        return SecItemAdd(attributes as CFDictionary, nil)
    }
}
