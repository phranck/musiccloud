//
//  LogoText.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A view that displays text with an animated rainbow gradient effect.
///
/// `LogoText` renders text using a custom font with a rainbow color gradient.
/// When animated, it creates a C64-style palette shifting effect where colors
/// flow smoothly from left to right through the text.
///
/// ## Usage
///
/// ```swift
/// // Static rainbow text
/// LogoText("musiccloud", size: 24)
///
/// // Animated rainbow text
/// LogoText("musiccloud", size: 24, isAnimating: true)
/// ```
///
/// ## Animation
///
/// The animation uses a 30 FPS timeline view with palette shifting technique
/// inspired by classic C64 demos. Colors are provided by ``RainbowPalette``.
struct LogoText: View {

    /// The text to display
    let text: String

    /// The font size to use
    let fontSize: CGFloat

    /// Whether the rainbow gradient should animate
    let isAnimating: Bool

    /// Creates a new logo text view.
    ///
    /// - Parameters:
    ///   - text: The text to display
    ///   - fontSize: The font size to use (default: 20)
    ///   - isAnimating: Whether to animate the gradient (default: false)
    init(_ text: String, size fontSize: CGFloat = 20, isAnimating: Bool = false) {
        self.text = text
        self.fontSize = fontSize
        self.isAnimating = isAnimating
    }

    var body: some View {
        if isAnimating {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                styledText(
                    colors: RainbowPalette.shiftedColors(for: timeline.date)
                )
            }
        } else {
            styledText(colors: RainbowPalette.colors)
        }
    }
}

// MARK: - Private Helpers

private extension LogoText {
    func styledText(colors: [Color]) -> some View {
        Text(text)
            .font(.custom("Nasalization", size: fontSize).weight(.bold))
            .foregroundStyle(
                LinearGradient(
                    colors: colors,
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
    }
}

// MARK: - Previews

#Preview {
    VStack(spacing: 20) {
        LogoText("musiccloud", size: 20)
        LogoText("musiccloud", size: 20, isAnimating: true)
            .padding()
            .background(.black)
    }
}
