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
/// inspired by classic C64 demos. Colors are interpolated between 8 base colors
/// to create smooth transitions.
struct LogoText: View {

    // MARK: - Properties

    /// Base color palette containing 8 primary rainbow colors
    private let baseColors = [
        Color(red: 1.0, green: 0.4, blue: 0.6),   // Pink/Magenta
        Color(red: 0.6, green: 0.4, blue: 1.0),   // Purple
        Color(red: 0.3, green: 0.6, blue: 1.0),   // Blue
        Color(red: 0.0, green: 0.8, blue: 0.9),   // Cyan
        Color(red: 0.0, green: 0.9, blue: 0.7),   // Teal
        Color(red: 0.5, green: 0.9, blue: 0.3),   // Green
        Color(red: 0.9, green: 0.9, blue: 0.3),   // Yellow
        Color(red: 1.0, green: 0.7, blue: 0.3)    // Orange
    ]

    /// The text to display
    let text: String
    
    /// The font size to use
    let fontSize: CGFloat
    
    /// Whether the rainbow gradient should animate
    let isAnimating: Bool
    
    // MARK: - Initialization
    
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
    
    // MARK: - Body
    
    var body: some View {
        if isAnimating {
            TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
                // C64-style palette shifting: Rotate colors in the array
                // 30 FPS, full cycle in 2 seconds = 60 frames
                let totalFrames = 60
                let currentFrame = Int(timeline.date.timeIntervalSinceReferenceDate * 30) % totalFrames
                
                // Calculate rotation steps (reversed for left-to-right movement)
                let rotationSteps = rainbowColors.count - ((currentFrame * rainbowColors.count) / totalFrames)
                
                // Rotate the color array (palette shifting!)
                let shiftedColors = Array(rainbowColors.dropFirst(rotationSteps) + rainbowColors.prefix(rotationSteps))
                
                Text(text)
                    .font(.custom("Nasalization", size: fontSize).weight(.bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: shiftedColors,
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
            }
        } else {
            Text(text)
                .font(.custom("Nasalization", size: fontSize).weight(.bold))
                .foregroundStyle(
                    LinearGradient(
                        colors: rainbowColors,
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
        }
    }
}

// MARK: - Private Helpers

private extension LogoText {
    
    /// Expanded rainbow color palette with interpolated intermediate colors.
    ///
    /// Creates a smooth gradient by generating 4 steps between each base color,
    /// resulting in 32 total colors (8 base colors × 4 steps).
    var rainbowColors: [Color] {
        expandColors(baseColors, stepsPerColor: 4)
    }

    /// Expands a color array by interpolating intermediate colors.
    ///
    /// - Parameters:
    ///   - colors: The base color array to expand
    ///   - stepsPerColor: Number of interpolation steps between each color pair
    /// - Returns: An expanded array with interpolated colors
    func expandColors(_ colors: [Color], stepsPerColor: Int) -> [Color] {
        var expanded: [Color] = []

        for i in 0..<colors.count {
            let current = colors[i]
            let next = colors[(i + 1) % colors.count]

            // Extract RGB components
            let (r1, g1, b1) = extractRGB(from: current)
            let (r2, g2, b2) = extractRGB(from: next)

            // Create intermediate steps
            for step in 0..<stepsPerColor {
                let fraction = Double(step) / Double(stepsPerColor)
                expanded.append(Color(
                    red: r1 + (r2 - r1) * fraction,
                    green: g1 + (g2 - g1) * fraction,
                    blue: b1 + (b2 - b1) * fraction
                ))
            }
        }

        return expanded
    }

    /// Extracts RGB components from a known base color.
    ///
    /// - Parameter color: The color to extract RGB values from
    /// - Returns: A tuple of (red, green, blue) values from 0.0 to 1.0
    func extractRGB(from color: Color) -> (Double, Double, Double) {
        // Map known base colors to their RGB values
        switch color {
        case baseColors[0]: return (1.0, 0.4, 0.6)   // Pink
        case baseColors[1]: return (0.6, 0.4, 1.0)   // Purple
        case baseColors[2]: return (0.3, 0.6, 1.0)   // Blue
        case baseColors[3]: return (0.0, 0.8, 0.9)   // Cyan
        case baseColors[4]: return (0.0, 0.9, 0.7)   // Teal
        case baseColors[5]: return (0.5, 0.9, 0.3)   // Green
        case baseColors[6]: return (0.9, 0.9, 0.3)   // Yellow
        case baseColors[7]: return (1.0, 0.7, 0.3)   // Orange
        default: return (0.5, 0.5, 0.5)              // Fallback
        }
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
