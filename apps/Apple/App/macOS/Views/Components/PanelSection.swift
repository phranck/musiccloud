#if os(macOS)
//
//  PanelSection.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import SwiftUI

/// A Liquid Glass card for the menu bar panel.
///
/// Each card is its own AppKit glass view, like the tiles in Control Center,
/// so it refracts the desktop behind the transparent panel. SwiftUI's glass
/// needs a `GlassEffectContainer` in this window, and that container draws a
/// shared surface behind all cards. An interactive card reacts to hover and
/// press where the system supports it, which is macOS 27 and later.
///
/// ## Usage
///
/// ```swift
/// PanelSection {
///     Text("Content")
/// }
///
/// PanelSection(padding: 16) {
///     VStack { ... }
/// }
/// ```
struct PanelSection<Content: View>: View {
    let padding: CGFloat
    let interactive: Bool
    @ViewBuilder let content: Content

    @State private var isHovered = false

    /// Creates a card.
    ///
    /// - Parameters:
    ///   - padding: The space between the card's edge and its content.
    ///   - interactive: Whether the card reacts to hover and press like a button.
    ///   - content: The card's content.
    init(padding: CGFloat = 0, interactive: Bool = false, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.interactive = interactive
        self.content = content()
    }

    // MARK: Public API

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(GlassCardBackground(
                cornerRadius: PanelMetrics.cornerRadius,
                interactive: interactive,
                isHighlighted: interactive && isHovered
            ))
            .onHover { isHovered = $0 }
    }
}

// MARK: - GlassCardBackground

/// An `NSGlassEffectView` behind a card's SwiftUI content.
///
/// A highlighted card tints its glass with the system fill color, which is
/// how a card that acts as a button answers the pointer.
private struct GlassCardBackground: NSViewRepresentable {
    let cornerRadius: CGFloat
    let interactive: Bool
    let isHighlighted: Bool

    func makeNSView(context: Context) -> NSGlassEffectView {
        let glass = NSGlassEffectView()
        configure(glass)
        return glass
    }

    func updateNSView(_ glass: NSGlassEffectView, context: Context) {
        configure(glass)
    }

    private func configure(_ glass: NSGlassEffectView) {
        glass.cornerRadius = cornerRadius
        glass.tintColor = isHighlighted ? PanelMetrics.hoverFill : nil
        if #available(macOS 27.0, *) {
            glass.effectIsInteractive = interactive
        }
    }
}

#endif
