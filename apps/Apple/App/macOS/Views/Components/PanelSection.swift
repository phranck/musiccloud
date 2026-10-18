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
/// shared surface behind all cards.
///
/// A card that acts as a button holds its content as the glass view's
/// `contentView`, the setup Apple documents for content on glass ("Setting a
/// contentView allows AppKit to apply all of the necessary visual treatments
/// … So avoid placing the NSGlassEffectView behind your content as a sibling
/// view", WWDC25 "Build an AppKit app with the new design"). From macOS 27
/// its glass is also interactive, which AppKit documents as visual feedback
/// "when it is interacted with". It answers hover with its tint on every
/// system. The other cards keep the glass behind their content.
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
        if interactive {
            GlassContentCard(
                cornerRadius: PanelMetrics.cornerRadius,
                isHighlighted: isHovered,
                // The hosting view inside the glass hosts its own SwiftUI
                // hierarchy, so it is given the panel's rendering mode here.
                content: paddedContent.onHover { isHovered = $0 }.symbolRenderingMode(.hierarchical)
            )
        } else {
            paddedContent.background(GlassCardBackground(cornerRadius: PanelMetrics.cornerRadius))
        }
    }

    private var paddedContent: some View { content.padding(padding).frame(maxWidth: .infinity, alignment: .leading) }
}

// MARK: - GlassCardBackground

/// An `NSGlassEffectView` behind a card's SwiftUI content.
private struct GlassCardBackground: NSViewRepresentable {
    let cornerRadius: CGFloat

    func makeNSView(context: Context) -> NSGlassEffectView {
        let glass = NSGlassEffectView()
        glass.cornerRadius = cornerRadius
        return glass
    }

    func updateNSView(_ glass: NSGlassEffectView, context: Context) { glass.cornerRadius = cornerRadius }
}

// MARK: - GlassContentCard

/// An `NSGlassEffectView` holding a card's SwiftUI content as its
/// `contentView`, for cards that act as buttons.
///
/// The card is as wide as SwiftUI offers and as tall as its content needs,
/// which the hosting view measures. A highlighted card tints its glass with
/// the system fill color.
private struct GlassContentCard<Content: View>: NSViewRepresentable {
    let cornerRadius: CGFloat
    let isHighlighted: Bool
    let content: Content

    func makeNSView(context: Context) -> NSGlassEffectView {
        let glass = NSGlassEffectView()
        let host = NSHostingView(rootView: content)
        host.autoresizingMask = [.width, .height]
        glass.contentView = host
        configure(glass)
        return glass
    }

    func updateNSView(_ glass: NSGlassEffectView, context: Context) {
        (glass.contentView as? NSHostingView<Content>)?.rootView = content
        configure(glass)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView glass: NSGlassEffectView, context: Context) -> CGSize? {
        guard let host = glass.contentView as? NSHostingView<Content>
        else {
            return nil
        }
        let fitting = host.fittingSize
        return CGSize(width: proposal.width ?? fitting.width, height: fitting.height)
    }

    private func configure(_ glass: NSGlassEffectView) {
        glass.cornerRadius = cornerRadius
        glass.tintColor = isHighlighted ? PanelMetrics.hoverFill : nil
        if #available(macOS 27.0, *) { glass.effectIsInteractive = true }
    }
}

#endif
