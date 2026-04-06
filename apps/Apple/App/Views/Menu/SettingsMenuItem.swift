//
//  SettingsMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import SwiftUI

struct SettingsMenuItem: View {
    @State private var isHovered = false

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "gearshape")
                .font(.system(size: 20))
            Text("Settings")
                .font(.caption)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .foregroundStyle(isHovered ? .white : .secondary)
        .contentShape(RoundedRectangle(cornerRadius: PanelMetrics.cornerRadius))
        .onHover { isHovered = $0 }
        .onTapGesture {
#if os(macOS)
            NSApp.keyWindow?.close()
            guard let delegate = AppDelegate.shared else {
                AppLogger.ui.error("AppDelegate not initialized")
                return
            }
            delegate.openSettings()
#endif
        }
    }
}
