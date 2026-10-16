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
/// Displays an SF Symbol icon above a text label. The card around it is an
/// interactive ``PanelSection``, whose glass holds this button as its content.
/// The whole card is the button, so VoiceOver and the keyboard treat it as one.
struct PanelActionItem: View {
    let icon: String
    /// A key into the string catalog, so the label follows the system language.
    let title: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(title)
                    .font(.caption)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .contentShape(.rect(cornerRadius: PanelMetrics.cornerRadius))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
    }
}

#endif
