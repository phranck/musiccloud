#if os(macOS)
//
//  AboutItem.swift
//  musiccloud
//

import SwiftUI

/// The footer card that opens Settings at the About pane.
///
/// The `info.app` symbol ships with macOS 27, so earlier systems show
/// `info.circle`, the symbol of the About pane in the Settings sidebar.
struct AboutItem: View {
    private var icon: String { if #available(macOS 27.0, *) { "info.app" } else { "info.circle" } }

    var body: some View {
        PanelActionItem(icon: icon, title: "About") {
            guard let delegate = AppDelegate.shared else {
                AppLogger.ui.error("AppDelegate not initialized")
                return
            }
            NSApp.keyWindow?.close()
            delegate.openSettings(showing: .about)
        }
    }
}

#endif
