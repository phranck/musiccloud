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

    /// RGB color value for interpolation.
    private struct RGB {
        let red: Double
        let green: Double
        let blue: Double
    }

    /// RGB values for each base color, single source of truth.
    private static let baseRGB: [RGB] = [
        RGB(red: 1.0, green: 0.4, blue: 0.6),   // Pink/Magenta
        RGB(red: 0.6, green: 0.4, blue: 1.0),   // Purple
        RGB(red: 0.3, green: 0.6, blue: 1.0),   // Blue
        RGB(red: 0.0, green: 0.8, blue: 0.9),   // Cyan
        RGB(red: 0.0, green: 0.9, blue: 0.7),   // Teal
        RGB(red: 0.5, green: 0.9, blue: 0.3),   // Green
        RGB(red: 0.9, green: 0.9, blue: 0.3),   // Yellow
        RGB(red: 1.0, green: 0.7, blue: 0.3)    // Orange
    ]

    /// Base color palette containing 8 primary rainbow colors, derived from ``baseRGB``.
    static let baseColors: [Color] = baseRGB.map { Color(red: $0.red, green: $0.green, blue: $0.blue) }

    /// Expanded rainbow palette with 32 interpolated colors (4 steps per base color).
    static let colors: [Color] = {
        var expanded: [Color] = []
        for index in 0..<baseRGB.count {
            let from = baseRGB[index]
            let next = baseRGB[(index + 1) % baseRGB.count]
            for step in 0..<4 {
                let fraction = Double(step) / 4.0
                expanded.append(Color(
                    red: from.red + (next.red - from.red) * fraction,
                    green: from.green + (next.green - from.green) * fraction,
                    blue: from.blue + (next.blue - from.blue) * fraction
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
