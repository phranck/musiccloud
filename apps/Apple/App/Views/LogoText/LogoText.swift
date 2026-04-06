//
//  LogoText.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A view that displays the musiccloud logo with an animated rainbow gradient effect.
///
/// Renders "musi" + music.note.list icon + "oud" using a custom font with a
/// rainbow color gradient. When animated, it creates a C64-style palette shifting
/// effect where colors flow smoothly from left to right.
///
/// ## Animation
///
/// The animation uses a 30 FPS timeline view with palette shifting technique
/// inspired by classic C64 demos. Colors are provided by ``RainbowPalette``.
struct LogoText: View {

    /// The font size to use
    let fontSize: CGFloat

    /// Whether the rainbow gradient should animate
    let isAnimating: Bool

    /// Creates a new logo text view.
    ///
    /// - Parameters:
    ///   - fontSize: The font size to use (default: 20)
    ///   - isAnimating: Whether to animate the gradient (default: false)
    init(size fontSize: CGFloat = 25, isAnimating: Bool = false) {
        self.fontSize = fontSize
        self.isAnimating = isAnimating
    }

    var body: some View {
        if isAnimating {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                styledLogo(
                    colors: RainbowPalette.shiftedColors(for: timeline.date)
                )
            }
        } else {
            styledLogo(colors: RainbowPalette.colors)
        }
    }
}

// MARK: - Private Helpers

private extension LogoText {
    var font: Font {
        .custom("Nasalization", size: fontSize).weight(.bold)
    }

    var logoContent: some View {
        HStack(alignment: .lastTextBaseline, spacing: 0) {
            Text("musicc")
                .font(font)
            Image(systemName: "music.note")
                .font(.system(size: fontSize * 0.85, weight: .bold))
                .offset(x: -0.5, y: fontSize * -0.12)
            Text("oud")
                .font(font)
                .offset(x: -4)
        }
    }

    func styledLogo(colors: [Color]) -> some View {
        logoContent
            .hidden()
            .overlay {
                LinearGradient(
                    colors: colors,
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .mask { logoContent }
            }
    }
}

// MARK: - Previews

#Preview {
    VStack(spacing: 20) {
        LogoText(size: 20)
        LogoText(size: 20, isAnimating: true)
            .padding()
            .background(.black)
    }
}
