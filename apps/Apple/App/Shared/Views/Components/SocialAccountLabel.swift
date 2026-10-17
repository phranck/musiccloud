//
//  SocialAccountLabel.swift
//  musiccloud
//

import SwiftUI

// MARK: - SocialAccountLabel

/// A connected account as Settings and the composer show it: the avatar,
/// the display name, and the handle below it.
struct SocialAccountLabel: View {
    let account: SocialAccount

    var body: some View {
        HStack(spacing: 10) {
            AsyncImage(url: account.avatarURL) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(.secondary)
            }.frame(width: 32, height: 32).clipShape(.circle)

            VStack(alignment: .leading, spacing: 2) {
                Text(account.name)
                Text(account.handle).font(.callout).foregroundStyle(.secondary)
            }
        }
    }
}
