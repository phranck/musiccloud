//
//  KeychainItems.swift
//  musiccloud
//

import Foundation
import Security

// MARK: - KeychainItems

/// Generic password items under one Keychain service, addressed by account.
///
/// Items live in the data protection Keychain and are readable after the
/// first unlock, so work in the background or in the Share Extension finds
/// them while the device is locked.
struct KeychainItems: Sendable {
    /// The service every item of this set is stored under.
    let service: String
    /// The access group shared with an extension, or `nil` for the app's own Keychain.
    let accessGroup: String?

    /// The data stored for `account`, if any.
    func data(for account: String) -> Data? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    /// Replaces the item for `account`, or deletes it when `data` is `nil`.
    func setData(_ data: Data?, for account: String) {
        let query = baseQuery(account: account)
        SecItemDelete(query as CFDictionary)
        guard let data else { return }
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(item as CFDictionary, nil)
        if status != errSecSuccess { AppLogger.api.error("Keychain write for \(account) in \(service) failed with status \(status)") }
    }

    private func baseQuery(account: String) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        return query
    }
}
