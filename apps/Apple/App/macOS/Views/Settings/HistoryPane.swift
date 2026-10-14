#if os(macOS)
//
//  HistoryPane.swift
//  musiccloud
//

import SwiftUI

// MARK: - HistoryPane

/// The History pane of the Settings window, holding the section that clears
/// the conversion history.
struct HistoryPane: View {
    var body: some View {
        Form {
            DangerZoneSection()
        }
        .formStyle(.grouped)
    }
}

#endif
