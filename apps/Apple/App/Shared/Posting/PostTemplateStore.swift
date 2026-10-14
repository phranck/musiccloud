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
@MainActor
@Observable
final class PostTemplateStore {
    /// The user's templates in the order they are listed.
    private(set) var templates: [PostTemplate] = []

    /// The templates that ship with the app, read-only.
    let systemTemplates: [PostTemplate]

    /// The template the Template Editor shows. It lives here so another
    /// window, such as Settings, can open the editor at a given template.
    var editorSelectionID: PostTemplate.ID?

    @ObservationIgnored private let fileURL: URL?
    /// Set when the file exists but cannot be read; saving is then refused.
    @ObservationIgnored private var isUnreadable = false

    /// Creates a store reading and writing `fileURL`, or keeping templates in memory when it is `nil`.
    ///
    /// - Parameters:
    ///   - fileURL: Where the user's templates are kept.
    ///   - systemTemplates: The read-only templates listed before the user's.
    init(fileURL: URL? = PostTemplateStore.defaultFileURL(), systemTemplates: [PostTemplate] = PostTemplate.system) {
        self.fileURL = fileURL
        self.systemTemplates = systemTemplates
        load()
    }

    /// Whether the template with `id` ships with the app and cannot be changed.
    func isSystem(_ id: PostTemplate.ID) -> Bool {
        systemTemplates.contains { $0.id == id }
    }

    /// Adds a copy of `template` under a new name and returns it, which is
    /// how a system template becomes a blueprint for one of the user's own.
    @discardableResult
    func duplicate(_ template: PostTemplate) -> PostTemplate {
        let copy = PostTemplate(name: String(localized: "\(template.name) Copy"), body: template.body, icon: template.icon)
        change { $0.append(copy) }
        return copy
    }

    /// Adds a template and returns it.
    @discardableResult
    func add(name: String, body: String = "") -> PostTemplate {
        let template = PostTemplate(name: name, body: body)
        change { $0.append(template) }
        return template
    }

    /// Replaces the stored template that has the same id.
    func update(_ template: PostTemplate) {
        change { templates in
            guard let index = templates.firstIndex(where: { $0.id == template.id }) else { return }
            templates[index] = template
        }
    }

    /// Removes the template with `id`.
    func delete(id: PostTemplate.ID) {
        change { $0.removeAll { $0.id == id } }
    }

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

    /// `Application Support/musiccloud/post-templates.json`, its folder created on demand.
    nonisolated static func defaultFileURL() -> URL? {
        let fileManager = FileManager.default
        guard let base = try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                              appropriateFor: nil, create: true) else { return nil }
        let directory = base.appending(path: "musiccloud", directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appending(path: "post-templates.json")
    }
}

private extension PostTemplateStore {
    func load() {
        // A file system path, not a URL path: "Application Support" must keep its space.
        guard let fileURL, FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else { return }
        do {
            templates = try JSONDecoder().decode([PostTemplate].self, from: Data(contentsOf: fileURL))
        } catch {
            isUnreadable = true
            AppLogger.ui.error("Post templates could not be read: \(error.localizedDescription)")
        }
    }

    func save() {
        guard let fileURL, !isUnreadable else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(templates).write(to: fileURL, options: .atomic)
        } catch {
            AppLogger.ui.error("Post templates could not be saved: \(error.localizedDescription)")
        }
    }
}
