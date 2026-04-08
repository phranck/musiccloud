#if os(macOS)
//
//  DashboardMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

struct DashboardItem: View {
    var body: some View {
        PanelActionItem(icon: "macwindow", title: "Dashboard") {
            NSApp.keyWindow?.close()
            guard let delegate = AppDelegate.shared else {
                AppLogger.ui.error("AppDelegate not initialized")
                return
            }
            delegate.openDashboard()
        }
    }
}

#endif
