#if os(macOS)
//
//  PostTemplateIconImage.swift
//  musiccloud
//

import SwiftUI

// MARK: - PostTemplateIcon + Menu

extension PostTemplateIcon {
    /// The icon for a menu item, which shows an image at its own size and
    /// ignores SwiftUI frames, so logos are drawn at menu size first.
    var menuImage: Image {
        switch source {
        case .asset(let name): Image(nsImage: .menuIcon(named: name))
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
                }.tag(Optional(choice))
            }
        }.labelsHidden().fixedSize()
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

// MARK: - DefaultTemplateSeal

/// A seal at the trailing edge of a template row that shows whether the
/// template is the default of a connected account: filled in a subdued
/// green when it is, outlined in gray when it is not.
///
/// As a menu, in the Templates pane of Settings, it also sets the default;
/// its items are ``DefaultTemplateAccountToggles``. Without a menu, in the
/// Template Editor's sidebar, whose context menu sets the default, it shows
/// only while the template is a default. With no connected accounts there
/// is nothing to be a default for, so it shows nothing at all.
struct DefaultTemplateSeal: View {
    let template: PostTemplate
    /// Whether the seal is a menu that sets the default, or only shows it.
    let isMenu: Bool

    @Environment(PostTemplateStore.self) private var store
    @Environment(SocialAccountStore.self) private var accountStore
    @Environment(DefaultTemplates.self) private var defaultTemplates

    /// How strongly the green shows, so the seal marks the default without drawing the eye.
    private static let defaultOpacity = 0.7

    var body: some View {
        let accounts = SocialAccount.all(in: accountStore)
        let defaultFor = defaultTemplates.accounts(using: template, of: accounts, among: store.allTemplates)
        let help =
            defaultFor.isEmpty
                ? String(localized: "Use as Default for")
                : String(localized: "Default for \(defaultFor.map(\.handle).formatted(.list(type: .and)))")
        if !accounts.isEmpty {
            if isMenu {
                Menu {
                    DefaultTemplateAccountToggles(template: template)
                } label: {
                    seal(isDefault: !defaultFor.isEmpty)
                }  // Only the seal shows: no button chrome and no menu arrow.
                .menuStyle(.button).buttonStyle(.plain).menuIndicator(.hidden).fixedSize().help(help).accessibilityLabel(help)
            } else if !defaultFor.isEmpty {
                seal(isDefault: true).help(help).accessibilityLabel(help)
            }
        }
    }

    private func seal(isDefault: Bool) -> some View {
        Image(systemName: isDefault ? "checkmark.seal.fill" : "checkmark.seal").font(.title3).symbolRenderingMode(.hierarchical)
            .foregroundStyle(isDefault ? AnyShapeStyle(.green.opacity(Self.defaultOpacity)) : AnyShapeStyle(.tertiary))
    }
}

// MARK: - DefaultTemplateAccountToggles

/// The connected accounts as menu items, checked where `template` is the
/// account's default.
///
/// Checking an account makes `template` its default; unchecking returns it
/// to the system template of its service. The seal's menu in Settings and
/// the Template Editor's context menu both list these.
struct DefaultTemplateAccountToggles: View {
    let template: PostTemplate

    @Environment(PostTemplateStore.self) private var store
    @Environment(SocialAccountStore.self) private var accountStore
    @Environment(DefaultTemplates.self) private var defaultTemplates

    var body: some View {
        ForEach(SocialAccount.all(in: accountStore)) { account in
            Toggle(isOn: isDefault(for: account)) {
                Label {
                    Text(account.handle)
                } icon: {
                    account.icon.menuImage
                }
            }
        }
    }

    private func isDefault(for account: SocialAccount) -> Binding<Bool> {
        Binding {
            defaultTemplates.template(for: account, among: store.allTemplates)?.id == template.id
        } set: { isOn in
            defaultTemplates.setTemplateID(isOn ? template.id : nil, for: account.id)
        }
    }
}

#endif
