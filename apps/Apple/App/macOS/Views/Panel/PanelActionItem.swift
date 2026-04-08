#if os(macOS)
//
//  PanelActionItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 08.04.26.
//

import SwiftUI

// MARK: - PanelActionItem

/// Reusable action button for the menu bar panel footer.
///
/// Displays an SF Symbol icon above a text label with hover highlighting.
struct PanelActionItem: View {
    let icon: String
    let title: String
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 20))
            Text(title)
                .font(.caption)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .foregroundStyle(isHovered ? .white : .secondary)
        .contentShape(RoundedRectangle(cornerRadius: PanelMetrics.cornerRadius))
        .onHover { isHovered = $0 }
        .onTapGesture { action() }
    }
}

#endif
