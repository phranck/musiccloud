//
//  MenuBarView.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI
#if os(macOS)
import AppKit
#endif

// MARK: - MenuBarView

struct MenuBarView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Environment(HistoryManager.self) private var historyManager

    private var history: [MediaInfo] {
        historyManager.entries
    }

    var body: some View {
        VStack(spacing: 0) {
            HeaderRow(isProcessing: monitor.status.isProcessing)

            Divider().padding(.vertical, 4)

            if let error = monitor.status.errorMessage {
                ErrorRow(message: error)
            } else if !history.isEmpty {
                MediaSection(history: Array(history.prefix(10)))
            } else {
                IdleRow()
            }

            Divider().padding(.vertical, 4)

            AboutMenuItem()
            PreferencesMenuItem()

            Divider().padding(.vertical, 4)

            QuitMenuItem()
        }
        .padding(.vertical, 4)
        .frame(width: 280)
        .background(Color(nsColor: .windowBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }
}

