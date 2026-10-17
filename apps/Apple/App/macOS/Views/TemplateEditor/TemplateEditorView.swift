#if os(macOS)
//
//  TemplateEditorView.swift
//  musiccloud
//

import SwiftData
import SwiftUI

// MARK: - TemplateEditorView

/// The Template Editor window: the templates in a sidebar, the selected
/// one edited beside it.
///
/// The window is resizable, so a long template has room, and it remembers
/// its frame through `AppDelegate.openTemplateEditor()`. System templates
/// are listed first and shown read-only; one of them becomes the user's own
/// through "Use as New Template".
struct TemplateEditorView: View {
    @Environment(PostTemplateStore.self) private var store
    /// The shown template, kept in the store so Settings can choose it.
    private var selectedID: PostTemplate.ID? {
        get { store.editorSelectionID }
        nonmutating set { store.editorSelectionID = newValue }
    }
    @AppStorage(DefaultsKey.templateLegendVisible) private var showsLegend = true

    var body: some View {
        NavigationSplitView {
            TemplateList(
                selectedID: selectionBinding,
                onAdd: addTemplate,
                onDelete: deleteSelected,
                onDuplicate: { selectedID = store.duplicate($0).id }
            ).navigationSplitViewColumnWidth(min: 180, ideal: 210, max: 300)
        } detail: {
            if let template = selectedTemplate {
                TemplateDetailView(
                    template: template,
                    isReadOnly: store.isSystem(template.id),
                    onChange: store.update,
                    onDuplicate: { selectedID = store.duplicate(template).id }
                ).id(template.id)
            } else {
                ContentUnavailableView {
                    Label(String(localized: "No Templates"), systemImage: "text.bubble")
                } description: {
                    Text("Templates hold the text of a post, with variables for the song, the album and its links.")
                } actions: {
                    Button(String(localized: "Add Template"), action: addTemplate)
                }
            }
        }
        // On the split view rather than in its detail column, so the legend
        // takes its width from the window's trailing edge and the template
        // sidebar keeps its own.
        .inspector(isPresented: $showsLegend) { VariableLegend().inspectorColumnWidth(min: 200, ideal: 240, max: 320) }.toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(String(localized: "Variables"), systemImage: "sidebar.trailing") { showsLegend.toggle() }.help(
                    String(localized: "Show or hide the variable legend")
                )
            }
        }.navigationTitle(selectedTemplate?.name ?? String(localized: "Templates")).frame(
            minWidth: Self.minimumSize.width,
            minHeight: Self.minimumSize.height
        )
    }

    /// The smallest the window may become, so sidebar, editor, preview and legend keep their room.
    static let minimumSize = CGSize(width: 760, height: 420)

    /// The size the window opens at the first time.
    static let initialSize = CGSize(width: 980, height: 560)
}

private extension TemplateEditorView {
    var selectedTemplate: PostTemplate? { store.allTemplates.first { $0.id == selectedID } ?? store.allTemplates.first }

    /// The list shows the first template as selected until another is chosen.
    var selectionBinding: Binding<PostTemplate.ID?> { Binding(get: { selectedTemplate?.id }, set: { if let id = $0 { selectedID = id } }) }

    func addTemplate() { selectedID = store.add(name: String(localized: "New Template")).id }

    /// Deletes the selected template unless it ships with the app.
    func deleteSelected() {
        guard let id = selectedTemplate?.id, !store.isSystem(id) else { return }
        store.delete(id: id)
        selectedID = store.allTemplates.first?.id
    }
}

// MARK: - TemplateList

/// The sidebar: the system templates and the user's by name, with add and
/// delete below. Delete is off while a system template is selected.
///
/// A template that is the default of a connected account shows a
/// ``DefaultTemplateSeal``. Every template's context menu makes it the
/// default of chosen accounts and duplicates it.
private struct TemplateList: View {
    @Binding var selectedID: PostTemplate.ID?
    let onAdd: () -> Void
    let onDelete: () -> Void
    let onDuplicate: (PostTemplate) -> Void

    @Environment(PostTemplateStore.self) private var store
    @Environment(SocialAccountStore.self) private var accountStore

    var body: some View {
        List(selection: $selectedID) {
            if !store.systemTemplates.isEmpty {
                Section(String(localized: "System Templates")) {
                    ForEach(store.systemTemplates) { template in row(template, isSystem: true) }
                }
            }
            Section(String(localized: "My Templates")) { ForEach(store.templates) { template in row(template, isSystem: false) } }
        }.listStyle(.sidebar).onDeleteCommand(perform: onDelete).safeAreaInset(edge: .bottom, spacing: 0) {
            HStack {
                // One control group, so add and delete have the same size
                // whatever the height of their symbols.
                ControlGroup {
                    Button(String(localized: "Add Template"), systemImage: "plus", action: onAdd)
                    Button(String(localized: "Delete Template"), systemImage: "minus", action: onDelete).disabled(
                        selectedID.map(store.isSystem) ?? true
                    )
                }.labelStyle(.iconOnly).fixedSize()
                Spacer()
            }.padding(10)
        }
    }

    private func row(_ template: PostTemplate, isSystem: Bool) -> some View {
        HStack {
            PostTemplateLabel(template: template, isSystem: isSystem)
            Spacer(minLength: 4)
            DefaultTemplateSeal(template: template, isMenu: false)
        }.tag(template.id).contextMenu {
            Menu(String(localized: "Use as Default for")) { DefaultTemplateAccountToggles(template: template) }.disabled(
                SocialAccount.all(in: accountStore).isEmpty
            )
            Button(String(localized: "Duplicate")) { onDuplicate(template) }
        }
    }
}

#Preview {
    let store = PostTemplateStore(
        fileURL: nil,
        systemTemplates: [
            PostTemplate(name: "Now playing", body: "Now playing: **{song_name}** by {artist}\n{track_count}\n{share_url}\n\n#nowplaying")
        ]
    )
    store.add(name: "Album tip", body: "Album tip: {album_name} by {artist} ({release_year})\n{share_url}")
    // swiftlint:disable:next force_try
    let container = try! ModelContainer(for: MediaEntry.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
    container.mainContext.insert(
        MediaEntry(
            originalUrl: "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt",
            shortUrl: "https://musiccloud.io/3CCvY3vW",
            mediaType: .track,
            artworkImageData: nil,
            track: TrackInfo(
                title: "MoonDial",
                artists: ["Pat Metheny"],
                albumName: "MoonDial",
                durationMs: 383_000,
                releaseDate: "2024-07-26"
            ),
            album: nil,
            artist: nil,
            serviceLinks: [
                ServiceLink(service: "spotify", displayName: "Spotify", url: "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt")
            ]
        )
    )
    return TemplateEditorView().environment(store).environment(SocialAccountStore(directory: nil, keychain: nil)).environment(
        DefaultTemplates(defaults: UserDefaults(suiteName: "TemplateEditorPreview") ?? .standard)
    ).modelContainer(container).frame(width: TemplateEditorView.initialSize.width, height: TemplateEditorView.initialSize.height)
}

#endif
