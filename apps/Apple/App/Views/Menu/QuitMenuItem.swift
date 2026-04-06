//
//  QuitMenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

struct QuitMenuItem: View {
    @State private var isHovered = false

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "power")
                .font(.system(size: 20))
            Text("Quit")
                .font(.caption)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .foregroundStyle(isHovered ? .white : .secondary)
        .contentShape(RoundedRectangle(cornerRadius: 14))
        .onHover { isHovered = $0 }
        .onTapGesture {
#if os(macOS)
            NSApplication.shared.terminate(nil)
#endif
        }
    }
}
