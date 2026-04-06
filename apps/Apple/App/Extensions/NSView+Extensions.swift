//
//  NSView+Extensions.swift
//  musiccloud
//
//  Created by Frank Gregor on 06.04.26.
//

#if os(macOS)
import AppKit

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
#endif
