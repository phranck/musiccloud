#if os(macOS)
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
    var status: ClipboardMonitor.Status

    var body: some View {
        HStack {
            Color.clear.frame(width: 8, height: 8)
            Spacer()
            LogoText(isAnimating: status.isProcessing)
            Spacer()
            Circle()
                .fill(indicatorColor)
                .frame(width: 8, height: 8)
                .accessibilityLabel(indicatorLabel)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

// MARK: - Private API

private extension HeaderRow {
    var indicatorColor: Color {
        switch status {
        case .idle:       .green
        case .processing: .yellow
        case .success:    .green
        case .error:      .red
        }
    }

    var indicatorLabel: String {
        switch status {
        case .idle:       "Monitoring active"
        case .processing: "Processing"
        case .success:    "Success"
        case .error:      "Error"
        }
    }
}

// MARK: - Previews

#Preview("Idle") {
    HeaderRow(status: .idle)
}

#Preview("Processing") {
    HeaderRow(status: .processing(url: "https://open.spotify.com/track/..."))
}

#Preview("Error") {
    HeaderRow(status: .error(message: "Could not connect"))
}

#endif
