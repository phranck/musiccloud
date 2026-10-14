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
struct TemplateDetailView: View {
    let isReadOnly: Bool
    let onChange: (PostTemplate) -> Void
    let onDuplicate: () -> Void

    @State private var draft: PostTemplate
    @Query private var newestEntries: [MediaEntry]

    /// - Parameters:
    ///   - template: The template to show.
    ///   - isReadOnly: Whether it ships with the app and cannot be changed.
    ///   - onChange: Called with the edited template after every change.
    ///   - onDuplicate: Called to copy the template under a new name.
    init(
        template: PostTemplate,
        isReadOnly: Bool,
        onChange: @escaping (PostTemplate) -> Void,
        onDuplicate: @escaping () -> Void
    ) {
        self.isReadOnly = isReadOnly
        self.onChange = onChange
        self.onDuplicate = onDuplicate
        _draft = State(initialValue: template)
        var newest = FetchDescriptor<MediaEntry>(sortBy: [SortDescriptor(\.date, order: .reverse)])
        newest.fetchLimit = 1
        _newestEntries = Query(newest)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if isReadOnly {
                    PostTemplateLabel(template: draft, isSystem: true)
                        .font(.headline)
                    Spacer()
                    Button(String(localized: "Use as New Template"), action: onDuplicate)
                } else {
                    PostTemplateIconPicker(icon: $draft.icon)
                    TextField(String(localized: "Name"), text: $draft.name)
                        .textFieldStyle(.roundedBorder)
                }
            }
            .padding(12)
            Divider()
            VSplitView {
                MarkdownTemplateEditor(
                    text: $draft.body,
                    isEditable: !isReadOnly,
                    tokens: TemplateCompletion.tokens(serviceLinks: newestEntries.first?.serviceLinks ?? [])
                )
                .frame(minHeight: 140)
                TemplatePreview(templateBody: draft.body, entry: newestEntries.first)
                    .frame(minHeight: 100)
            }
        }
        .onChange(of: draft) {
            guard !isReadOnly else { return }
            onChange(draft)
        }
    }
}

// MARK: - TemplatePreview

/// The template filled with an entry and its Markdown rendered.
private struct TemplatePreview: View {
    let templateBody: String
    let entry: MediaEntry?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Preview")
                    .font(.headline)
                if let entry {
                    Text(Self.rendered(templateBody, with: PostContext(entry: entry)))
                        .textSelection(.enabled)
                    Text("Filled with your latest conversion.")
                        .foregroundStyle(.secondary)
                } else {
                    Text("Convert a link to see the preview.")
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
        }
        .background(.background.secondary)
    }

    /// The filled template with its Markdown rendered, or as plain text when
    /// it is not valid Markdown.
    static func rendered(_ body: String, with context: PostContext) -> AttributedString {
        let text = PostTemplateRenderer.render(body, with: context)
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
    }
}

#endif
