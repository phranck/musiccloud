//
//  ShareButton.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

struct ShareButton: View {
    /// The short URL to share
    let shortUrl: String

    @State private var isHovered = false

    var body: some View {
        ShareLink(item: shortUrl) {
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 14))
                .foregroundStyle(isHovered ? .primary : .secondary)
        }
        .buttonStyle(.borderless)
        .onHover { isHovered = $0 }
        .help("Share \(shortUrl)")
    }
}
