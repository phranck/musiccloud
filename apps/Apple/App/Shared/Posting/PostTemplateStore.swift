//
//  PostTemplateStore.swift
//  musiccloud
//

import Foundation
import Observation

// MARK: - PostTemplateStore

/// The post templates, kept as JSON in Application Support.
///
/// Templates stay on this Mac. The file is written after every change, so
/// nothing is lost when the app quits, and a file that cannot be read is
/// left untouched and reported rather than overwritten with an empty list.
///
/// System templates ship with the app. They are listed with the user's
/// templates but never stored, changed or deleted; ``duplicate(_:)`` turns
/// one into a template of the user's own.
@MainActor @Observable final class PostTemplateStore {
    /// The user's templates in the order they are listed.
    private(set) var templates: [PostTemplate] = []

    /// The templates that ship with the app, read-only.
    let systemTemplates: [PostTemplate]

    /// The template the Template Editor shows. It lives here so another
    /// window, such as Settings, can open the editor at a given template.
    var editorSelectionID: PostTemplate.ID?

    @ObservationIgnored private let file: JSONFile<[PostTemplate]>?

    /// Creates a store reading and writing `fileURL`, or keeping templates in memory when it is `nil`.
    ///
    /// - Parameters:
    ///   - fileURL: Where the user's templates are kept.
    ///   - systemTemplates: The read-only templates listed before the user's.
    init(fileURL: URL? = PostTemplateStore.defaultFileURL(), systemTemplates: [PostTemplate] = PostTemplate.system) {
        self.file = fileURL.map { JSONFile(url: $0, label: "Post templates") }
        self.systemTemplates = systemTemplates
        load()
    }

    /// Every template a post can be written with: the system templates first, then the user's.
    var allTemplates: [PostTemplate] { systemTemplates + templates }

    /// Whether the template with `id` ships with the app and cannot be changed.
    func isSystem(_ id: PostTemplate.ID) -> Bool { systemTemplates.contains { $0.id == id } }

    /// Adds a copy of `template` under a new name and returns it, which is
    /// how a system template becomes a blueprint for one of the user's own.
    @discardableResult func duplicate(_ template: PostTemplate) -> PostTemplate {
        let copy = PostTemplate(name: String(localized: "\(template.name) Copy"), body: template.body, icon: template.icon)
        change { $0.append(copy) }
        return copy
    }

    /// Adds a template and returns it.
    @discardableResult func add(name: String, body: String = "") -> PostTemplate {
        let template = PostTemplate(name: name, body: body)
        change { $0.append(template) }
        return template
    }

    /// Replaces the stored template that has the same id.
    func update(_ template: PostTemplate) {
        change { templates in
            guard let index = templates.firstIndex(where: { $0.id == template.id })
            else {
                return
            }
            templates[index] = template
        }
    }

    /// Removes the template with `id`.
    func delete(id: PostTemplate.ID) { change { $0.removeAll { $0.id == id } } }

    /// Reads the file again, applies `edit`, and writes the result.
    ///
    /// Another copy of the app, such as a second build, may have written
    /// the file since this one read it. Starting from the file rather than
    /// from memory keeps its templates instead of overwriting them.
    private func change(_ edit: (inout [PostTemplate]) -> Void) {
        load()
        edit(&templates)
        save()
    }

    /// `Application Support/musiccloud/post-templates.json`.
    nonisolated static func defaultFileURL() -> URL? { .applicationSupportFile(named: "post-templates.json") }
}

private extension PostTemplateStore {
    func load() { if let stored = file?.load() { templates = stored } }

    func save() { file?.save(templates) }
}
