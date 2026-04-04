//
//  QuitMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A menu item that quits the application when tapped.
///
/// `QuitMenuItem` displays a power icon with "Quit musiccloud" text.
/// On macOS, tapping terminates the application. On other platforms, the tap
/// gesture has no effect.
///
/// ## Appearance
///
/// - Icon: Power symbol (SF Symbol)
/// - Text: "Quit musiccloud"
/// - Style: Configured as the last item in the menu (extra bottom spacing)
///
/// ## Usage
///
/// ```swift
/// // In a menu bar extra or settings view
/// QuitMenuItem()
/// ```
///
/// ## Platform Support
///
/// The quit functionality is macOS-only. On iOS/iPadOS, this view can be displayed
/// but the tap action will not terminate the app.
struct QuitMenuItem: View {
    var body: some View {
        MenuItem(title: "Quit musiccloud", isLastItem: true)
        .onTapGesture {
#if os(macOS)
            NSApplication.shared.terminate(nil)
#endif
        }
    }
}

