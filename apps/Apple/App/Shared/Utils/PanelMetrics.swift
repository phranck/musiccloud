//
//  PanelMetrics.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import SwiftUI

/// Geometry of the macOS menu bar panel.
enum PanelMetrics {
    static let spacing: CGFloat = 6
    static let cornerRadius: CGFloat = 21
    /// The width of the panel and of its content, which share one value so
    /// the window and the SwiftUI frame agree.
    static let panelWidth: CGFloat = 380
    /// The panel's smallest height, used before the content has measured itself.
    static let minimumPanelHeight: CGFloat = 280
    /// Transparent space around the cards inside the panel window, so the
    /// shadow of the cards' glass fades out instead of ending at the window
    /// edge, which would draw it as a hard rectangle.
    static let shadowMargin: CGFloat = 32

    #if os(macOS)
    /// The fill everything in the panel takes under the pointer. The footer
    /// cards tint their glass with it, and the rows of the history list fill
    /// their background with it. It is the strongest of the system's neutral
    /// fills, so the hover reads clearly on glass.
    static let hoverFill: NSColor = .systemFill
    #endif
}
