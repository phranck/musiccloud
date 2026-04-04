//
//  SettingsView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import SwiftUI

/// Placeholder view for the Settings section.
struct SettingsView: View {
    var body: some View {
        ContentUnavailableView {
            Label(String(localized: "Settings"), systemImage: "gearshape")
        } description: {
            Text(String(localized: "Coming soon."))
        }
    }
}
