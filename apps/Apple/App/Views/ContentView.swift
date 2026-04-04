//
//  ContentView.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

// MARK: - ContentView

/// The main content view for the iOS/iPadOS interface.
///
/// `ContentView` displays a scrollable list containing:
/// - A ``StatusCard`` showing the current clipboard monitor status
/// - A ``HistoryList`` of recent conversions (when available)
///
/// ## Platform
///
/// This view is used on iOS and iPadOS. On macOS, ``MenuBarView`` is used instead
/// as a menu bar extra.
///
/// ## Environment
///
/// Reads ``ClipboardMonitor`` and ``HistoryManager`` from the SwiftUI environment.
///
/// ## Topics
///
/// ### Body
/// - ``body``
struct ContentView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Environment(HistoryManager.self) private var historyManager

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    StatusCard(monitor: monitor)
                    if !history.isEmpty {
                        HistoryList(history: history)
                    }
                }
                .padding()
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("musiccloud")
        }
    }
}

// MARK: - Computed Properties

private extension ContentView {
    /// All conversion entries from the history manager.
    var history: [MediaInfo] {
        historyManager.entries
    }
}
