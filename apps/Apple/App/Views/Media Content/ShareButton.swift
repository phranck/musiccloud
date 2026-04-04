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

    var body: some View {
        ShareLink(item: shortUrl) {
            Image(systemName: "square.and.arrow.up")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.borderless)
        .help("Share \(shortUrl)")
    }
}
