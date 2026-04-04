//
//  MenuItem.swift
//  musiccloud
//
//  Created by Frank Gregor on 03.04.26.
//

import SwiftUI

struct MenuItem: View {
    @State private var isHovered = false

    let iconName: String
    let title: String
    let isLastItem: Bool

    init(iconName: String, title: String, isLastItem: Bool = false) {
        self.iconName = iconName
        self.title = title
        self.isLastItem = isLastItem
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconName)
                .font(.system(size: 16))
                .frame(width: 20)
            Text(title)
                .font(.system(size: 14))
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .foregroundStyle(isHovered ? Color.white : Color.primary)
        .contentShape(Rectangle())
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 5,
                bottomLeadingRadius: isLastItem ? 12 : 5,
                bottomTrailingRadius: isLastItem ? 12 : 5,
                topTrailingRadius: 5
            )
            .fill(isHovered ? Color.accentColor : Color.clear)
            .padding(.horizontal, 4)
        )
        .onHover { hovering in
            isHovered = hovering
        }
    }
}
