#if os(macOS)
//
//  MenuBarIcon.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A menu bar icon that shows a rainbow flowing upward while processing.
///
/// Displays the `music.note.list` SF Symbol. When `isProcessing` is true,
/// the symbol is filled with ``RainbowPalette`` as horizontal stripes that
/// move from the bottom to the top, 30 times a second, the same palette
/// shift the wordmark uses from left to right. When idle, it renders as a
/// standard template icon. Both states use hierarchical rendering, as every
/// icon in the app does; the status item hosts this view on its own, outside
/// any window that would set it.
struct MenuBarIcon: View {
    /// Whether a URL is currently being resolved
    var isProcessing: Bool

    var body: some View {
        Group {
            if isProcessing {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                    Image(systemName: "music.note.list")
                        .font(.system(size: 16))
                        // From bottom to top, so the palette's shift runs upward.
                        .foregroundStyle(LinearGradient(
                            colors: RainbowPalette.shiftedColors(for: timeline.date),
                            startPoint: .bottom,
                            endPoint: .top
                        ))
                }
            } else {
                Image(systemName: "music.note.list")
                    .font(.system(size: 16))
            }
        }
        .symbolRenderingMode(.hierarchical)
    }
}

#endif
