#if os(macOS)
//
//  IdleRow.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

struct IdleRow: View {
    var body: some View {
        Text("Monitoring clipboard for streaming URLs…")
            .font(.body)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .accessibilityLabel("Monitoring clipboard for streaming URLs")
    }
}

#endif
