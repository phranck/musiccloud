#if os(macOS)
//
//  TemplatesPane.swift
//  musiccloud
//

import SwiftUI

// MARK: - TemplatesPane

/// The Templates pane of the Settings window: the post templates that ship
/// with the app and the user's own, with a fixed button below that opens
/// the Template Editor window, where there is room to write them. A double
/// click on a template opens the editor at that template.
///
/// Each row ends in a ``DefaultTemplateSeal`` that shows whether the
/// template is an account's default and, as a menu, makes it one.
struct TemplatesPane: View {
    @Environment(PostTemplateStore.self) private var store

    var body: some View {
        Form {
            if !store.systemTemplates.isEmpty {
                Section {
                    ForEach(store.systemTemplates) { template in
                        row(template, isSystem: true)
                    }
                } header: {
                    Text("System Templates")
                } footer: {
                    Text("System templates can't be changed. Use one as a blueprint for a template of your own.")
                }
            }

            Section {
                if store.templates.isEmpty {
                    Text("No templates yet.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(store.templates) { template in
                        row(template, isSystem: false)
                    }
                }
            } header: {
                Text("My Templates")
            }
        }
        .formStyle(.grouped)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                Spacer()
                Button(String(localized: "Edit Templates…")) {
                    AppDelegate.shared?.openTemplateEditor()
                }
            }
            .padding(20)
        }
    }

    private func row(_ template: PostTemplate, isSystem: Bool) -> some View {
        HStack {
            PostTemplateLabel(template: template, isSystem: isSystem)
            Spacer()
            DefaultTemplateSeal(template: template, isMenu: true)
        }
        .opensInTemplateEditor(template)
    }
}

private extension View {
    /// Opens the Template Editor at `template` on a double click anywhere in
    /// the row, and offers to duplicate it from the context menu, which opens
    /// the editor at the copy.
    func opensInTemplateEditor(_ template: PostTemplate) -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
            .onTapGesture(count: 2) {
                AppDelegate.shared?.openTemplateEditor(selecting: template.id)
            }
            .contextMenu {
                Button(String(localized: "Duplicate")) {
                    guard let delegate = AppDelegate.shared else { return }
                    delegate.openTemplateEditor(selecting: delegate.templateStore.duplicate(template).id)
                }
            }
    }
}

#Preview {
    let store = PostTemplateStore(
        fileURL: nil,
        systemTemplates: [PostTemplate(name: "Now playing", body: "{song_name} by {artist}\n{share_url}")]
    )
    store.add(name: "Mastodon post", body: "{song_name}")
    store.add(name: "Bluesky post", body: "{song_name}")
    store.add(name: "Album tip", body: "{album_name}")
    var mastodon = store.templates[0]
    mastodon.icon = .mastodon
    store.update(mastodon)
    var bluesky = store.templates[1]
    bluesky.icon = .bluesky
    store.update(bluesky)
    let accounts = SocialAccountStore(directory: nil, keychain: nil)
    accounts.add(MastodonAccount(instance: URL(string: "https://oldbytes.space")!, accountID: "1", username: "musiccloud",
                                 displayName: "musiccloud", avatarURL: nil, characterLimit: 5000), token: "preview")
    return TemplatesPane()
        .environment(store)
        .environment(accounts)
        .environment(DefaultTemplates(defaults: UserDefaults(suiteName: "TemplatesPanePreview") ?? .standard))
        .frame(width: 400, height: 440)
}

#endif
