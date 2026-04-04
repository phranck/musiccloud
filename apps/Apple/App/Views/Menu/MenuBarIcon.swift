//
//  MenuBarIcon.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A menu bar icon that animates while processing.
///
/// Displays the `music.note.list` SF Symbol. When `isProcessing` is true,
/// the icon uses a variable color symbol effect to indicate activity.
struct MenuBarIcon: View {
    /// Whether a URL is currently being resolved
    var isProcessing: Bool

    var body: some View {
        Image(systemName: "music.note.list")
            .symbolEffect(.pulse, isActive: isProcessing)
    }
}
