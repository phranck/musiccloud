#if os(macOS)
//
//  PostTemplateIconImage.swift
//  musiccloud
//

import SwiftUI

// MARK: - PostTemplateIconImage

/// Draws a ``PostTemplateIcon`` at the size of the surrounding text.
///
/// Logos and SF Symbols share one frame, so a list of templates lines up
/// whichever icon each has. The logos are template images drawn in their
/// network's brand color, as in the original; the symbols take the text color.
struct PostTemplateIconImage: View {
    let icon: PostTemplateIcon

    var body: some View {
        switch icon.source {
        case .asset(let name):
            Image(name)
                .resizable()
                .scaledToFit()
                .frame(width: 16, height: 16)
                .foregroundStyle(icon.brandColor ?? .primary)
        case .symbol(let name):
            Image(systemName: name)
                .frame(width: 16, height: 16)
        }
    }
}

extension PostTemplateIcon {
    /// The icon for a menu item, which shows an image at its own size and
    /// ignores SwiftUI frames, so logos are drawn at menu size first.
    var menuImage: Image {
        switch source {
        case .asset(let name):  Image(nsImage: .menuIcon(named: name))
        case .symbol(let name): Image(systemName: name)
        }
    }
}

// MARK: - PostTemplateIconPicker

/// Chooses a template's icon, or none, from a pop-up menu.
struct PostTemplateIconPicker: View {
    @Binding var icon: PostTemplateIcon?

    var body: some View {
        Picker(String(localized: "Icon"), selection: $icon) {
            Text("None").tag(PostTemplateIcon?.none)
            Divider()
            ForEach(PostTemplateIcon.allCases) { choice in
                Label {
                    Text(choice.title)
                } icon: {
                    choice.menuImage
                }
                .tag(Optional(choice))
            }
        }
        .labelsHidden()
        .fixedSize()
    }
}

// MARK: - PostTemplateLabel

/// A template's name with its icon, or with a lock for a system template
/// that has none.
struct PostTemplateLabel: View {
    let template: PostTemplate
    let isSystem: Bool

    var body: some View {
        Label {
            Text(template.name)
        } icon: {
            if let icon = template.icon {
                PostTemplateIconImage(icon: icon)
            } else if isSystem {
                Image(systemName: "lock")
            } else {
                Image(systemName: "text.bubble")
            }
        }
    }
}

#endif
