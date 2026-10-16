//
//  NSImage+MenuIcon.swift
//  musiccloud
//

#if os(macOS)
import AppKit

extension NSImage {
    /// An asset drawn into a 16 by 16 point template image for a menu item.
    ///
    /// Menus show an image at its own size and ignore SwiftUI frames, so a
    /// logo stored at 74 points would fill the menu. The asset is scaled to
    /// fit, centered, and marked as a template so it takes the menu's text
    /// color. Returns `fallbackSymbol` when the asset is missing.
    ///
    /// - Parameters:
    ///   - name: The asset catalog name, such as `ServiceIcons/spotify`.
    ///   - fallbackSymbol: The SF Symbol used when no such asset exists.
    static func menuIcon(named name: String, fallbackSymbol: String = "music.note") -> NSImage {
        let canvasSize = NSSize(width: 16, height: 16)
        guard let original = NSImage(named: name) else {
            return NSImage(systemSymbolName: fallbackSymbol, accessibilityDescription: name)?
                .withSymbolConfiguration(.preferringHierarchical()) ?? NSImage()
        }
        let originalSize = original.size
        let scale = min(canvasSize.width / originalSize.width, canvasSize.height / originalSize.height)
        let scaledSize = NSSize(width: originalSize.width * scale, height: originalSize.height * scale)
        let origin = NSPoint(
            x: (canvasSize.width - scaledSize.width) / 2,
            y: (canvasSize.height - scaledSize.height) / 2
        )
        let resized = NSImage(size: canvasSize, flipped: false) { _ in
            original.draw(in: NSRect(origin: origin, size: scaledSize))
            return true
        }
        resized.isTemplate = true
        return resized
    }
}
#endif
