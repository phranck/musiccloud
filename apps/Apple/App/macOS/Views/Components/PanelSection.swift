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
/// The glass is the system's own, so it follows the appearance, the
/// accessibility settings and the desktop behind the panel. An interactive
/// card also gets the system's hover and press response, which is why cards
/// that act as buttons set `interactive`. Place the panel's cards in one
/// `GlassEffectContainer`, so the system renders them together.
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
            .glassEffect(
                .regular.interactive(interactive),
                in: .rect(cornerRadius: PanelMetrics.cornerRadius)
            )
    }
}

#endif
