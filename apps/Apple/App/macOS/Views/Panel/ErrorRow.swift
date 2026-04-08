#if os(macOS)
//
//  ErrorRow.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A view that displays an error message with a warning icon.
///
/// `ErrorRow` shows a horizontal layout with an orange warning triangle icon
/// and the error message text. Used to display conversion errors in the menu bar.
///
/// ## Appearance
///
/// - **Icon**: Orange exclamation triangle (SF Symbol)
/// - **Message**: Secondary text color for reduced emphasis
/// - **Layout**: Horizontal stack with 8pt spacing
///
/// ## Usage
///
/// ```swift
/// ErrorRow(message: "Rate limit exceeded - please wait")
/// ErrorRow(message: "Invalid URL")
/// ```
///
/// ## Topics
///
/// ### Properties
/// - ``message``
struct ErrorRow: View {
    var message: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.body)
                .foregroundStyle(.orange)
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(message)")
    }
}

#endif
