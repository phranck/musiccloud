#if os(macOS)
//
//  TemplateDetailView.swift
//  musiccloud
//

import SwiftData
import SwiftUI

// MARK: - TemplateDetailView

/// Edits one template: its name, its Markdown body, and a preview filled
/// with the newest history entry, so a post's look is visible while writing.
///
/// The edits are handed to `onChange` as they happen, so nothing waits for
/// a save. Editor and preview share the height through a split view whose
/// divider can be dragged. A system template is shown read-only, with a
/// button that copies it into a template of the user's own.
///
/// A template with the Mastodon or Bluesky icon counts its filled text
/// against that service's limit below the editor, and the preview marks
/// what goes past it; see ``TemplatePostLimit``.
struct TemplateDetailView: View {
    let isReadOnly: Bool
    let onChange: (PostTemplate) -> Void
    let onDuplicate: () -> Void

    @State private var draft: PostTemplate
    @Query private var newestEntries: [MediaEntry]
    @Environment(SocialAccountStore.self) private var accounts

    /// - Parameters:
    ///   - template: The template to show.
    ///   - isReadOnly: Whether it ships with the app and cannot be changed.
    ///   - onChange: Called with the edited template after every change.
    ///   - onDuplicate: Called to copy the template under a new name.
    init(template: PostTemplate, isReadOnly: Bool, onChange: @escaping (PostTemplate) -> Void, onDuplicate: @escaping () -> Void) {
        self.isReadOnly = isReadOnly
        self.onChange = onChange
        self.onDuplicate = onDuplicate
        _draft = State(initialValue: template)
        var newest = FetchDescriptor<MediaEntry>(sortBy: [SortDescriptor(\.date, order: .reverse)])
        newest.fetchLimit = 1
        _newestEntries = Query(newest)
    }

    private var postLimit: TemplatePostLimit? { TemplatePostLimit(icon: draft.icon, mastodonAccounts: accounts.mastodonAccounts) }

    private var filledText: String? { newestEntries.first.map { PostTemplateRenderer.render(draft.body, with: PostContext(entry: $0)) } }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if isReadOnly {
                    PostTemplateLabel(template: draft, isSystem: true).font(.headline)
                    Spacer()
                    Button(String(localized: "Use as New Template"), action: onDuplicate)
                } else {
                    PostTemplateIconPicker(icon: $draft.icon)
                    TextField(String(localized: "Name"), text: $draft.name).textFieldStyle(.roundedBorder)
                }
            }.padding(12)
            Divider()
            VSplitView {
                VStack(spacing: 0) {
                    MarkdownTemplateEditor(
                        text: $draft.body,
                        isEditable: !isReadOnly,
                        tokens: TemplateCompletion.tokens(serviceLinks: newestEntries.first?.serviceLinks ?? [])
                    )
                    if let postLimit, let filledText { CharacterCounter(length: postLimit.length(of: filledText), limit: postLimit.limit) }
                }.frame(minHeight: 140)
                TemplatePreview(filledText: filledText, postLimit: postLimit).frame(minHeight: 100)
            }
        }.onChange(of: draft) {
            guard !isReadOnly else { return }
            onChange(draft)
        }
    }
}

// MARK: - TemplatePostLimit

/// The limit a template's text has to keep, from the service its icon names.
///
/// Bluesky allows 300 graphemes. Mastodon allows what the connected server
/// allows; with several accounts the smallest limit counts, so the template
/// fits every one of them, and Markdown counts as rendered only when every
/// one of those servers renders it. Without a Mastodon account, upstream
/// Mastodon's 500 characters apply.
struct TemplatePostLimit: Equatable {
    enum Service: Equatable {
        case mastodon(markdown: Bool)
        case bluesky
    }

    let service: Service
    let limit: Int

    init?(icon: PostTemplateIcon?, mastodonAccounts: [MastodonAccount]) {
        switch icon {
        case .mastodon:
            service = .mastodon(markdown: !mastodonAccounts.isEmpty && mastodonAccounts.allSatisfy(\.supportsMarkdown))
            limit = mastodonAccounts.map(\.characterLimit).min() ?? MastodonAPI.defaultCharacterLimit
        case .bluesky:
            service = .bluesky
            limit = BlueskyAPI.postGraphemeLimit
        default: return nil
        }
    }

    /// The length the service counts for `markdown` as it will be sent.
    func length(of markdown: String) -> Int {
        switch service {
        case .mastodon(let markdownRendered):
            PostFormatter.mastodonLength(of: markdownRendered ? markdown : PostFormatter.mastodonPlainText(fromMarkdown: markdown))
        case .bluesky: PostFormatter.bluesky(fromMarkdown: markdown).graphemeCount
        }
    }
}

// MARK: - CharacterCounter

/// `length / limit` at the trailing edge, red once the text is too long.
private struct CharacterCounter: View {
    let length: Int
    let limit: Int

    var body: some View {
        HStack {
            Spacer()
            Text("\(length) / \(limit) characters").monospacedDigit().foregroundStyle(length > limit ? .red : .secondary)
        }.font(.callout).padding(.horizontal, 12).padding(.vertical, 6)
    }
}

// MARK: - TemplatePreview

/// The filled template as its service shows it, on a card of its own.
///
/// Without a service it is the Markdown rendered. For Bluesky and for a
/// Mastodon server without Markdown it is the plain text that is sent. What
/// goes past the limit is tinted and dimmed, so it is plain where the post
/// would end.
private struct TemplatePreview: View {
    let filledText: String?
    let postLimit: TemplatePostLimit?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Preview").font(.headline)
                if let filledText {
                    Text(Self.preview(of: filledText, limit: postLimit)).textSelection(.enabled).frame(
                        maxWidth: .infinity,
                        alignment: .leading
                    ).padding(12).background(.background, in: .rect(cornerRadius: 8)).overlay(
                        RoundedRectangle(cornerRadius: 8).strokeBorder(.separator)
                    )
                    Text("Filled with your latest conversion.").foregroundStyle(.secondary)
                } else {
                    Text("Convert a link to see the preview.").foregroundStyle(.secondary)
                }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(12)
        }.background(.background.secondary)
    }

    /// The text shown, with everything past the limit marked.
    static func preview(of markdown: String, limit: TemplatePostLimit?) -> AttributedString {
        var shown: AttributedString
        let overflow: String.Index?
        switch limit?.service {
        case .bluesky:
            let text = PostFormatter.bluesky(fromMarkdown: markdown).text
            shown = AttributedString(text)
            overflow = PostFormatter.graphemeOverflowStart(in: text, limit: limit?.limit ?? .max)
            return marked(shown, plain: text, from: overflow)
        case .mastodon(markdown: false):
            let text = PostFormatter.mastodonPlainText(fromMarkdown: markdown)
            shown = AttributedString(text)
            overflow = PostFormatter.mastodonOverflowStart(in: text, limit: limit?.limit ?? .max)
            return marked(shown, plain: text, from: overflow)
        case .mastodon(markdown: true), nil:
            let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
            shown = (try? AttributedString(markdown: markdown, options: options)) ?? AttributedString(markdown)
            guard let limit else { return shown }
            // The overflow is found in the rendered characters, which is
            // where the reader sees the post end.
            let visible = String(shown.characters)
            return marked(shown, plain: visible, from: PostFormatter.mastodonOverflowStart(in: visible, limit: limit.limit))
        }
    }

    /// `text` with the part from `overflow` on tinted and dimmed; `plain` is its characters.
    static func marked(_ text: AttributedString, plain: String, from overflow: String.Index?) -> AttributedString {
        guard let overflow else { return text }
        var marked = text
        let offset = plain.distance(from: plain.startIndex, to: overflow)
        let start = marked.index(marked.startIndex, offsetByCharacters: offset)
        marked[start...].backgroundColor = .red.opacity(0.15)
        marked[start...].foregroundColor = .secondary
        marked[start...].inlinePresentationIntent = nil
        marked[start...].link = nil
        return marked
    }
}

#endif
