//
//  PanelSection.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

import SwiftUI

/// A reusable floating card with material background for use in menu bar panels.
///
/// Provides a consistent visual style for grouped content sections,
/// using `.thickMaterial` with rounded corners to create a floating card appearance.
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
enum PanelMetrics {
    static let spacing: CGFloat = 6
    static let cornerRadius: CGFloat = 21
}

struct PanelSection<Content: View>: View {
    let padding: CGFloat
    let hoverable: Bool
    @ViewBuilder let content: Content

    @State private var isHovered = false

    init(padding: CGFloat = 0, hoverable: Bool = false, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.hoverable = hoverable
        self.content = content()
    }

    // MARK: Public API

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: PanelMetrics.cornerRadius)
                    .fill(.thinMaterial)
                    .shadow(color: .white.opacity(isHovered ? 0.08 : 0), radius: 4, y: -1)
            )
            .overlay {
                if isHovered {
                    RoundedRectangle(cornerRadius: PanelMetrics.cornerRadius)
                        .fill(.white.opacity(0.04))
                        .allowsHitTesting(false)
                }
            }
            .scaleEffect(isHovered ? 1.04 : 1.0)
            .onHover { hovered in
                guard hoverable else { return }
                withAnimation(.easeInOut(duration: 0.15)) {
                    isHovered = hovered
                }
            }
    }
}
