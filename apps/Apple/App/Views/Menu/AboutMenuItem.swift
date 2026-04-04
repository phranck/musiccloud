//
//  AboutMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI
#if os(macOS)
import AppKit
#endif

struct AboutMenuItem: View {
    var body: some View {
        MenuItem(title: NSLocalizedString("About musiccloud", comment: ""))
            .onTapGesture {
#if os(macOS)
                // Menü schließen
                NSApplication.shared.keyWindow?.close()
                // About Panel öffnen
                NSApplication.shared.orderFrontStandardAboutPanel()
#else
#endif
            }
    }
}
