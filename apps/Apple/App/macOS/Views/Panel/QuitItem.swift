#if os(macOS)
//
//  QuitMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

struct QuitItem: View {
    var body: some View {
        PanelActionItem(icon: "power", title: "Quit") {
            NSApplication.shared.terminate(nil)
        }
    }
}

#endif
