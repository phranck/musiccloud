#if os(macOS)
//
//  AboutView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import SwiftUI

/// Placeholder view for the About section.
struct AboutView: View {
    var body: some View {
        ContentUnavailableView {
            Label(String(localized: "About"), systemImage: "info.circle")
        } description: {
            Text(String(localized: "Coming soon."))
        }
    }
}

#endif
