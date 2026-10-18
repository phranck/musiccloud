#if os(macOS)
//
//  PostComposerView.swift
//  musiccloud
//

import SwiftUI

// MARK: - PostComposerView

/// The window that posts a history entry: a template to start from, the
/// accounts to post to, and below them one text per chosen account with the
/// length its service counts against its limit.
///
/// The counter turns red past the limit and Post stays disabled until every
/// text fits. Each account reports below its text whether it posted; once
/// all have, the window closes.
struct PostComposerView: View {
    /// The window's size when it opens the first time; it remembers its frame after that.
    static let initialSize = CGSize(width: 560, height: 640)

    @State var model: PostComposerModel

    var body: some View {
        Group {
            if model.templates.isEmpty {
                ContentUnavailableView {
                    Label(String(localized: "No Templates"), systemImage: "text.bubble")
                } description: {
                    Text("Create a template first. The post is written from it.")
                } actions: {
                    Button(String(localized: "Edit Templates…")) { AppDelegate.shared?.openTemplateEditor() }
                }
            } else {
                composer
            }
        }.frame(minWidth: 480, minHeight: 420).navigationTitle(String(localized: "Post \(model.title)")).task {
            for account in model.accounts { model.replace(await account.refreshed()) }
        }
    }

    private var composer: some View {
        Form {
            Section {
                // Each account starts from its own default; one template
                // chosen here fills every text from it instead.
                Picker(String(localized: "Template"), selection: $model.templateID) {
                    Text("Default of Each Account").tag(PostTemplate.ID?.none)
                    Divider()
                    ForEach(model.templates) { template in Text(template.name).tag(Optional(template.id)) }
                }
            }

            Section(String(localized: "Accounts")) {
                ForEach(model.accounts) { account in
                    Toggle(isOn: selection(of: account)) {
                        HStack(spacing: 8) {
                            PostTemplateIconImage(icon: account.icon)
                            SocialAccountLabel(account: account)
                        }
                    }.disabled(model.isPosting)
                }
            }

            ForEach(model.selectedAccounts) { account in DraftSection(model: model, account: account) }
        }.formStyle(.grouped).safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                if model.isPosting { ProgressView().controlSize(.small) }
                Spacer()
                Button(String(localized: "Cancel"), role: .cancel) { AppDelegate.shared?.closeComposer() }.keyboardShortcut(.cancelAction)
                Button(String(localized: "Post")) {
                    Task {
                        await model.post { account, text in try await account.post(text) }
                        if model.isDone { AppDelegate.shared?.closeComposer() }
                    }
                }.keyboardShortcut(.defaultAction).disabled(!model.canPost)
            }.padding(20)
        }
    }

    private func selection(of account: SocialAccount) -> Binding<Bool> {
        Binding {
            model.selectedAccountIDs.contains(account.id)
        } set: { isOn in
            if isOn { model.selectedAccountIDs.insert(account.id) } else { model.selectedAccountIDs.remove(account.id) }
        }
    }
}

// MARK: - DraftSection

/// One account's text with its counter, what format arrives, and how posting went.
private struct DraftSection: View {
    @Bindable var model: PostComposerModel
    let account: SocialAccount

    var body: some View {
        Section {
            TextEditor(
                text: Binding {
                    model.drafts[account.id] ?? ""
                } set: {
                    model.drafts[account.id] = $0
                }
            ).font(.body).frame(minHeight: 110).disabled(model.isPosting || model.states[account.id] == .posted)
        } header: {
            HStack {
                Label {
                    Text(account.handle)
                } icon: {
                    PostTemplateIconImage(icon: account.icon)
                }
                Spacer()
                Text(verbatim: "\(model.length(for: account)) / \(account.limit)").monospacedDigit().foregroundStyle(
                    model.length(for: account) > account.limit ? .red : .secondary
                )
            }
        } footer: {
            footer
        }
    }

    /// What the reader gets from the Markdown on this account's service.
    private var formatNote: String {
        switch account {
        case .mastodon where account.keepsMarkdown: String(localized: "This server shows Markdown formatted.")
        case .mastodon: String(localized: "This server shows plain text, so the Markdown characters are removed.")
        case .bluesky: String(localized: "Bluesky shows plain text. Links and hashtags stay clickable.")
        }
    }

    @ViewBuilder private var footer: some View {
        switch model.states[account.id] ?? .idle {
        case .idle: Text(formatNote)
        case .posting: Text("Posting…")
        case .posted: Label(String(localized: "Posted"), systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed(let message): Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.red)
        }
    }
}

#endif
