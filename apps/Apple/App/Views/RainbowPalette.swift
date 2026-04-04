//
//  RainbowPalette.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A reusable rainbow color palette with C64-style palette shifting animation support.
///
/// Provides a base palette of 8 colors, an expanded smooth gradient of 32 colors,
/// and methods to compute shifted palettes for animation frames.
///
/// ## Usage
///
/// ```swift
/// // Static gradient colors
/// let colors = RainbowPalette.colors
///
/// // Shifted colors for a specific animation frame
/// let shifted = RainbowPalette.shiftedColors(for: date)
///
/// // Single cycling color for a specific animation frame
/// let color = RainbowPalette.cyclingColor(for: date)
/// ```
enum RainbowPalette {

    /// Base color palette containing 8 primary rainbow colors.
    static let baseColors: [Color] = [
        Color(red: 1.0, green: 0.4, blue: 0.6),   // Pink/Magenta
        Color(red: 0.6, green: 0.4, blue: 1.0),   // Purple
        Color(red: 0.3, green: 0.6, blue: 1.0),   // Blue
        Color(red: 0.0, green: 0.8, blue: 0.9),   // Cyan
        Color(red: 0.0, green: 0.9, blue: 0.7),   // Teal
        Color(red: 0.5, green: 0.9, blue: 0.3),   // Green
        Color(red: 0.9, green: 0.9, blue: 0.3),   // Yellow
        Color(red: 1.0, green: 0.7, blue: 0.3)    // Orange
    ]

    /// RGB values for each base color, used for interpolation.
    private static let baseRGB: [(Double, Double, Double)] = [
        (1.0, 0.4, 0.6),   // Pink/Magenta
        (0.6, 0.4, 1.0),   // Purple
        (0.3, 0.6, 1.0),   // Blue
        (0.0, 0.8, 0.9),   // Cyan
        (0.0, 0.9, 0.7),   // Teal
        (0.5, 0.9, 0.3),   // Green
        (0.9, 0.9, 0.3),   // Yellow
        (1.0, 0.7, 0.3)    // Orange
    ]

    /// Expanded rainbow palette with 32 interpolated colors (4 steps per base color).
    static let colors: [Color] = {
        var expanded: [Color] = []
        for i in 0..<baseRGB.count {
            let (r1, g1, b1) = baseRGB[i]
            let (r2, g2, b2) = baseRGB[(i + 1) % baseRGB.count]
            for step in 0..<4 {
                let f = Double(step) / 4.0
                expanded.append(Color(
                    red: r1 + (r2 - r1) * f,
                    green: g1 + (g2 - g1) * f,
                    blue: b1 + (b2 - b1) * f
                ))
            }
        }
        return expanded
    }()

    /// Returns the palette shifted for the given point in time (30 FPS, 2s cycle).
    ///
    /// Used for gradient animations where the entire color array rotates.
    ///
    /// - Parameter date: The current timeline date
    /// - Returns: A shifted copy of ``colors``
    static func shiftedColors(for date: Date) -> [Color] {
        let totalFrames = 60
        let currentFrame = Int(date.timeIntervalSinceReferenceDate * 30) % totalFrames
        let rotationSteps = colors.count - ((currentFrame * colors.count) / totalFrames)
        return Array(colors.dropFirst(rotationSteps) + colors.prefix(rotationSteps))
    }

    /// Returns a single color cycling through the palette (30 FPS, 2s cycle).
    ///
    /// Used for icon or small element animations where a gradient doesn't fit.
    ///
    /// - Parameter date: The current timeline date
    /// - Returns: The current color in the cycle
    static func cyclingColor(for date: Date) -> Color {
        let totalFrames = 60
        let currentFrame = Int(date.timeIntervalSinceReferenceDate * 30) % totalFrames
        let index = (currentFrame * colors.count) / totalFrames
        return colors[index]
    }
}
