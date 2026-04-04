//
//  DashboardMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

struct DashboardMenuItem: View {
    var body: some View {
        MenuItem(title: NSLocalizedString("Open musiccloud...", comment: ""))
            .onTapGesture {
#if os(macOS)
                NSApp.keyWindow?.close()
                AppDelegate.shared?.openDashboard()
#endif
            }
    }
}
