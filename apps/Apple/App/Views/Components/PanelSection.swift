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
struct PanelSection<Content: View>: View {
    let padding: CGFloat
    @ViewBuilder let content: Content

    init(padding: CGFloat = 0, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    // MARK: Public API

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 21))
    }
}
