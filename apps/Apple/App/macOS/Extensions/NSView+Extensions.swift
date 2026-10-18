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
        for sub in subviews { if let found = sub.findFirst(type) { return found } }
        return nil
    }
}

// MARK: - WindowKeyMonitor

/// Installs a local key-event monitor for Escape (close window, unless
/// `closesOnEscape` is off), Cmd+F (focus search) and Cmd+1 to Cmd+9 (handed
/// to `onCommandNumber`).
///
/// The toolbar search field lives outside `contentView`, so we search from the
/// window's theme frame (`contentView.superview`) which contains both content and toolbar.
/// The app runs without a menu bar, so these shortcuts cannot live in a menu.
struct WindowKeyMonitor: NSViewRepresentable {
    /// Whether Escape closes the window. The menu bar panel closes through
    /// `AppDelegate`, which fades it out, so it turns this off.
    var closesOnEscape = true
    /// Called with 1 to 9 when the user presses Cmd and that digit, and only Cmd.
    var onCommandNumber: (Int) -> Void = { _ in }

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        let coordinator = context.coordinator
        coordinator.onCommandNumber = onCommandNumber
        // The monitor lives until the coordinator removes it, so the closure
        // holds the coordinator weakly instead of keeping it alive itself.
        coordinator.monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak coordinator] event in
            guard
                let window = view.window,
                window.isKeyWindow
            else {
                return event
            }
            if closesOnEscape, event.keyCode == 53 {  // Escape
                window.close()
                return nil
            }

            if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
               let number = event.charactersIgnoringModifiers.flatMap(Int.init), (1...9).contains(number)
            {
                coordinator?.onCommandNumber(number)
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

    func updateNSView(_ nsView: NSView, context: Context) { context.coordinator.onCommandNumber = onCommandNumber }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var monitor: Any?
        var onCommandNumber: (Int) -> Void = { _ in }
        deinit { if let monitor { NSEvent.removeMonitor(monitor) } }
    }
}
#endif
