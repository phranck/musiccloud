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
@MainActor
@Observable
final class PostTemplateStore {
    /// The templates in the order they are listed.
    private(set) var templates: [PostTemplate] = []

    @ObservationIgnored private let fileURL: URL?
    /// Set when the file exists but cannot be read; saving is then refused.
    @ObservationIgnored private var isUnreadable = false

    /// Creates a store reading and writing `fileURL`, or keeping templates in memory when it is `nil`.
    init(fileURL: URL? = PostTemplateStore.defaultFileURL()) {
        self.fileURL = fileURL
        load()
    }

    /// Adds a template and returns it.
    @discardableResult
    func add(name: String, body: String = "") -> PostTemplate {
        let template = PostTemplate(name: name, body: body)
        templates.append(template)
        save()
        return template
    }

    /// Replaces the stored template that has the same id.
    func update(_ template: PostTemplate) {
        guard let index = templates.firstIndex(where: { $0.id == template.id }) else { return }
        templates[index] = template
        save()
    }

    /// Removes the template with `id`.
    func delete(id: PostTemplate.ID) {
        templates.removeAll { $0.id == id }
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
        guard let fileURL, FileManager.default.fileExists(atPath: fileURL.path()) else { return }
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
