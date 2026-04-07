#if os(macOS)
//
//  DashboardView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import AppKit
import SwiftUI

/// The main dashboard view with toolbar-based filter navigation.
///
/// Provides access to history (tracks, albums, artists) via a centered
/// `AnimatedSegmentControl` in the toolbar.
struct DashboardView: View {
    @State private var filter: SidebarItem = .tracks

    var body: some View {
        NavigationStack {
            HistoryView(filter: $filter)
        }
        .frame(minWidth: 800, maxWidth: .infinity, minHeight: 500, maxHeight: .infinity)
    }
}

#endif
