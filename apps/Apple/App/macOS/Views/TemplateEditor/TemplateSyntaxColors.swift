#if os(macOS)
//
//  TemplateSyntaxColors.swift
//  musiccloud
//

import AppKit

// MARK: - TemplateSyntaxColors

/// The colors of the template editor's syntax highlighting, and of the
/// placeholders in the variable legend.
///
/// They are the accent tones of Solarized, a muted retro palette designed
/// to read the same on light and dark backgrounds, so one value per kind
/// serves both appearances.
enum TemplateSyntaxColors {
    /// Solarized violet, `#6C71C4`.
    static let variable = NSColor(srgbRed: 0x6C / 255, green: 0x71 / 255, blue: 0xC4 / 255, alpha: 1)
    /// Solarized red, `#DC322F`.
    static let unknownVariable = NSColor(srgbRed: 0xDC / 255, green: 0x32 / 255, blue: 0x2F / 255, alpha: 1)
    /// Solarized cyan, `#2AA198`.
    static let hashtag = NSColor(srgbRed: 0x2A / 255, green: 0xA1 / 255, blue: 0x98 / 255, alpha: 1)
    /// Solarized blue, `#268BD2`.
    static let link = NSColor(srgbRed: 0x26 / 255, green: 0x8B / 255, blue: 0xD2 / 255, alpha: 1)
    /// Solarized orange, `#CB4B16`.
    static let code = NSColor(srgbRed: 0xCB / 255, green: 0x4B / 255, blue: 0x16 / 255, alpha: 1)
    /// Solarized green, `#859900`.
    static let quote = NSColor(srgbRed: 0x85 / 255, green: 0x99 / 255, blue: 0x00 / 255, alpha: 1)
}

#endif
