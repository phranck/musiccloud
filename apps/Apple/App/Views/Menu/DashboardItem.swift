//
//  DashboardMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

struct DashboardItem: View {
    @State private var isHovered = false

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "macwindow")
                .font(.system(size: 20))
            Text("Dashboard")
                .font(.caption)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .foregroundStyle(isHovered ? .white : .secondary)
        .contentShape(RoundedRectangle(cornerRadius: 14))
        .onHover { isHovered = $0 }
        .onTapGesture {
#if os(macOS)
            NSApp.keyWindow?.close()
            guard let delegate = AppDelegate.shared else {
                AppLogger.ui.error("AppDelegate not initialized")
                return
            }
            delegate.openDashboard()
#endif
        }
    }
}
