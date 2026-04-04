//
//  HistoryList.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A styled list view displaying recent conversion history.
///
/// `HistoryList` shows up to 20 recent conversions in a card-style container
/// with a "Recent" header. Used in the iOS/iPadOS interface.
///
/// ## Appearance
///
/// - **Header**: "Recent" in headline font
/// - **Container**: Regular material background with 16pt corner radius
/// - **Rows**: ``HistoryRow`` items with dividers between them
/// - **Limit**: Shows maximum 20 entries
///
/// ## Usage
///
/// ```swift
/// if !historyManager.entries.isEmpty {
///     HistoryList(history: historyManager.entries)
/// }
/// ```
///
/// ## Topics
///
/// ### Properties
/// - ``history``
struct HistoryList: View {
    var history: [ConversionEntry]

    var body: some View {
        let prefixed = Array(history.prefix(20))
        return VStack(alignment: .leading, spacing: 8) {
            Text("Recent")
                .font(.headline)
                .padding(.horizontal, 4)
            VStack(spacing: 0) {
                ForEach(prefixed) { entry in
                    HistoryRow(entry: entry)
                    if entry.id != prefixed.last?.id {
                        Divider().padding(.leading, 16)
                    }
                }
            }
            .background(.regularMaterial, in: .rect(cornerRadius: 16))
        }
    }
}
