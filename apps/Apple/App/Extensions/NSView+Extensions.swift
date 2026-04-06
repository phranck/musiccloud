//
//  NSView+Extensions.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

#if os(macOS)
import AppKit
import SwiftUI

extension NSView {
    /// Recursively searches the view hierarchy for the first subview of the given type.
    func findFirst<T: NSView>(_ type: T.Type) -> T? {
        if let match = self as? T { return match }
        for sub in subviews {
            if let found = sub.findFirst(type) { return found }
        }
        return nil
    }
}

// MARK: - WindowKeyMonitor

/// Installs a local key-event monitor for Escape (close window) and Cmd+F (focus search).
///
/// The toolbar search field lives outside `contentView`, so we search from the
/// window's theme frame (`contentView.superview`) which contains both content and toolbar.
struct WindowKeyMonitor: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        context.coordinator.monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            guard let window = view.window, window.isKeyWindow else { return event }

            if event.keyCode == 53 { // Escape
                window.close()
                return nil
            }

            if event.modifierFlags.contains(.command), event.charactersIgnoringModifiers == "f" {
                let root = window.contentView?.superview ?? window.contentView
                if let searchField = root?.findFirst(NSSearchField.self) {
                    window.makeFirstResponder(searchField)
                    return nil
                }
            }

            return event
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var monitor: Any?
        deinit {
            if let monitor { NSEvent.removeMonitor(monitor) }
        }
    }
}
#endif
