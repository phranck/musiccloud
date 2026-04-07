#if os(macOS)
//
//  MenuBarIcon.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A menu bar icon that cycles through rainbow colors while processing.
///
/// Displays the `music.note.list` SF Symbol. When `isProcessing` is true,
/// the icon color cycles through ``RainbowPalette`` at 30 FPS.
/// When idle, it renders as a standard template icon.
struct MenuBarIcon: View {
    /// Whether a URL is currently being resolved
    var isProcessing: Bool

    var body: some View {
        if isProcessing {
            TimelineView(.animation(minimumInterval: 1.0 / 12.0)) { timeline in
                Image(systemName: "music.note.list")
                    .font(.system(size: 16))
                    .foregroundStyle(RainbowPalette.cyclingColor(for: timeline.date))
            }
        } else {
            Image(systemName: "music.note.list")
                .font(.system(size: 16))
        }
    }
}

#endif
