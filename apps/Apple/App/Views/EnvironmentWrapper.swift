//
//  EnvironmentWrapper.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import SwiftUI

/// Wraps Observable objects as @State to ensure SwiftUI tracks mutations
/// when hosting views inside NSHostingView.
struct EnvironmentWrapper<Content: View>: View {
    @State private var historyManager: HistoryManager
    @State private var monitor: ClipboardMonitor

    private let content: () -> Content

    init(historyManager: HistoryManager, monitor: ClipboardMonitor, @ViewBuilder content: @escaping () -> Content) {
        _historyManager = State(wrappedValue: historyManager)
        _monitor = State(wrappedValue: monitor)
        self.content = content
    }

    var body: some View {
        content()
            .environment(historyManager)
            .environment(monitor)
    }
}
