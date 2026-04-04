//
//  HeaderRow.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A header row view displaying the musiccloud logo and status indicator.
///
/// `HeaderRow` shows the animated musiccloud logo in the center with a status
/// indicator circle on the right. The logo animation and circle color change
/// based on the processing state.
///
/// ## Appearance
///
/// - **Logo**: Center-aligned "musiccloud" text with optional rainbow animation
/// - **Status Indicator**: 8×8pt circle on the right (green when idle, yellow when processing)
/// - **Spacing**: Balanced padding with invisible spacers for alignment
///
/// ## Usage
///
/// ```swift
/// // Idle state
/// HeaderRow(isProcessing: false)
///
/// // Processing state (logo animates, yellow indicator)
/// HeaderRow(isProcessing: true)
/// ```
///
/// ## Topics
///
/// ### Initialization
/// - ``init(isProcessing:)``
///
/// ### Properties
/// - ``isProcessing``
struct HeaderRow: View {
    var isProcessing: Bool

    init(isProcessing: Bool) {
        self.isProcessing = isProcessing
    }

    var body: some View {
        HStack {
            Color.clear.frame(width: 8, height: 8)
            Spacer()
            LogoText("musiccloud", isAnimating: isProcessing)
            Spacer()
            Circle()
                .fill(isProcessing ? .yellow : .green)
                .frame(width: 8, height: 8)
                .accessibilityLabel("Monitoring active")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Previews

#Preview("Active") {
    HeaderRow(isProcessing: false)
}

#Preview("Processing") {
    HeaderRow(isProcessing: true)
}

