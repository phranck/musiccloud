//
//  MenuBarView.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftData
import SwiftUI
#if os(macOS)
import AppKit
#endif

// MARK: - MenuBarView

struct MenuBarView: View {
    @Environment(ClipboardMonitor.self) private var monitor
    @Environment(\.modelContext) private var modelContext

    @State private var entries: [MediaEntry] = []

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 0) {
                HeaderRow(isProcessing: monitor.status.isProcessing)

                Divider().padding(.vertical, 4)

                if let error = monitor.status.errorMessage {
                    ErrorRow(message: error)
                } else if !entries.isEmpty {
                    MediaSection(history: Array(entries.prefix(10)))
                } else {
                    IdleRow()
                }

                Divider().padding(.vertical, 4)

                DashboardMenuItem()

                Divider().padding(.vertical, 4)

                QuitMenuItem()
            }
            .padding(.vertical, 4)
            .background(Color(nsColor: .windowBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 9))
        }
        .frame(width: 320)
        .onAppear { fetchEntries() }
        .onReceive(NotificationCenter.default.publisher(for: .historyDidChange)) { _ in
            fetchEntries()
        }
    }
}

// MARK: - Private API

private extension MenuBarView {
    func fetchEntries() {
        let descriptor = FetchDescriptor<MediaEntry>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        entries = (try? modelContext.fetch(descriptor)) ?? []
    }
}
