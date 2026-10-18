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
    ///   - fontSize: The font size to use (default: 25)
    ///   - isAnimating: Whether to animate the gradient (default: false)
    init(size fontSize: CGFloat = 25, isAnimating: Bool = false) {
        self.fontSize = fontSize
        self.isAnimating = isAnimating
    }

    var body: some View {
        if isAnimating {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                StyledLogo(fontSize: fontSize, colors: RainbowPalette.shiftedColors(for: timeline.date))
            }
        } else {
            StyledLogo(fontSize: fontSize, colors: RainbowPalette.colors)
        }
    }
}

// MARK: - OutlinedLogoText

/// The wordmark with a black outline one pixel wide, so its light colors keep
/// their edge on bright backgrounds such as the day sky or a white bar.
///
/// SwiftUI has no stroke for text, so black copies of the wordmark sit one
/// pixel off in eight directions behind it.
struct OutlinedLogoText: View {
    private static let outlineDirections = 8

    let fontSize: CGFloat
    let isAnimating: Bool

    @Environment(\.displayScale) private var displayScale

    /// - Parameters:
    ///   - fontSize: The font size to use (default: 25)
    ///   - isAnimating: Whether to animate the gradient (default: false)
    init(size fontSize: CGFloat = 25, isAnimating: Bool = false) {
        self.fontSize = fontSize
        self.isAnimating = isAnimating
    }

    var body: some View {
        let pixel = 1 / displayScale
        ZStack {
            ForEach(0..<Self.outlineDirections, id: \.self) { direction in
                let angle = Double(direction) * 2 * .pi / Double(Self.outlineDirections)
                LogoText(size: fontSize).colorMultiply(.black).offset(x: cos(angle) * pixel, y: sin(angle) * pixel)
            }
            LogoText(size: fontSize, isAnimating: isAnimating)
        }.accessibilityElement(children: .ignore).accessibilityLabel(Text(verbatim: "musiccloud"))
    }
}

// MARK: - LogoContent

private struct LogoContent: View {
    let fontSize: CGFloat

    private var font: Font { .custom("Nasalization", size: fontSize).weight(.bold) }

    var body: some View {
        let note = Image(systemName: "music.note").font(.system(size: fontSize * 0.95, weight: .semibold))
        #if os(iOS)
        // The note's offset was tuned in a navigation bar, where it
        // renders exactly as at the large image scale (measured in a
        // preview); set here, it looks the same outside a bar too.
        let platformNote = note.imageScale(.large)
        let noteOffset = CGSize(width: -0.5, height: fontSize * -0.24)
        let suffixOffset: CGFloat = -7
        #else
        let platformNote = note
        let noteOffset = CGSize(width: -0.3, height: fontSize * -0.12)
        let suffixOffset: CGFloat = -3.5
        #endif
        HStack(alignment: .lastTextBaseline, spacing: 0) {
            // Logo parts - must not be localized
            Text(verbatim: "musicc").font(font)
            platformNote.offset(x: noteOffset.width, y: noteOffset.height)
            Text(verbatim: "oud").font(font).offset(x: suffixOffset)
        }
    }
}

// MARK: - StyledLogo

private struct StyledLogo: View {
    let fontSize: CGFloat
    let colors: [Color]

    var body: some View {
        LogoContent(fontSize: fontSize).hidden().overlay {
            LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing).mask { LogoContent(fontSize: fontSize) }
        }
    }
}

// MARK: - Previews

#Preview {
    VStack(spacing: 20) {
        LogoText(size: 20)
        LogoText(size: 20, isAnimating: true).padding().background(.black)
    }
}
