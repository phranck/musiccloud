//
//  PreferencesMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

struct PreferencesMenuItem: View {
    var body: some View {
        MenuItem(iconName: "", title: NSLocalizedString("Preferences...", comment: ""))
            .onTapGesture {
#if os(macOS)
                // Menü schließen
                NSApplication.shared.keyWindow?.close()
                // Hier könntest du später ein Preferences-Fenster öffnen
#endif
            }
    }
}
