#if os(macOS)
//
//  SettingsMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import SwiftUI

struct SettingsItem: View {
    var body: some View {
        PanelActionItem(icon: "gearshape", title: "Settings") {
            NSApp.keyWindow?.close()
            guard let delegate = AppDelegate.shared else {
                AppLogger.ui.error("AppDelegate not initialized")
                return
            }
            delegate.openSettings()
        }
    }
}

#endif
