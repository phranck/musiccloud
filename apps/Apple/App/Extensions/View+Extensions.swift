//
//  View+Extensions.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

extension View {
    /// Conditionally applies a view transformation.
    ///
    /// - Parameters:
    ///   - condition: Whether to apply the transformation
    ///   - transform: The transformation to apply if condition is true
    /// - Returns: The transformed view if condition is true, otherwise the original view
    @ViewBuilder
    func `if`<Transform: View>(_ condition: Bool, transform: (Self) -> Transform) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }
}
