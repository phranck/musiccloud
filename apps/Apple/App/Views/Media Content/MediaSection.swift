//
//  MediaSection.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

/// A vertical list of conversion history rows for the menu bar.
///
/// `MediaSection` displays a compact list of ``MediaRow`` items,
/// showing recent URL conversions in the menu bar dropdown interface.
///
/// ## Usage
///
/// ```swift
/// // Display the 10 most recent conversions
/// MediaSection(history: Array(historyManager.entries.prefix(10)))
/// ```
///
/// ## Layout
///
/// - Vertical stack with no spacing between rows
/// - Left-aligned content
/// - Uses `ForEach` with entry IDs for efficient updates
///
/// ## Topics
///
/// ### Properties
/// - ``history``
struct MediaSection: View {
    var history: [MediaInfo]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(history) { entry in
                MediaRow(entry: entry)
            }
        }
    }
}
