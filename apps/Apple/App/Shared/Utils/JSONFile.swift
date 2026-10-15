//
//  JSONFile.swift
//  musiccloud
//

import Foundation

// MARK: - JSONFile

/// A value kept as a JSON file, read and written whole.
///
/// A file that exists but cannot be read is reported and never overwritten,
/// so a damaged or newer-format file is not replaced by an empty value.
/// Writes are atomic, so a crash mid-write leaves the previous file.
final class JSONFile<Value: Codable> {
    /// Where the value is kept.
    let url: URL
    /// Names the content in log messages, such as "Post templates".
    private let label: String
    /// Set once the file failed to read; ``save(_:)`` then does nothing.
    private(set) var isUnreadable = false

    init(url: URL, label: String) {
        self.url = url
        self.label = label
    }

    /// The stored value, or `nil` when the file does not exist yet or cannot be read.
    func load() -> Value? {
        // A file system path, not a URL path: "Application Support" must keep its space.
        guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return nil }
        do {
            return try JSONDecoder().decode(Value.self, from: Data(contentsOf: url))
        } catch {
            isUnreadable = true
            AppLogger.ui.error("\(self.label) could not be read: \(error.localizedDescription)")
            return nil
        }
    }

    /// Replaces the file with `value`, formatted so a person can read it.
    func save(_ value: Value) {
        guard !isUnreadable else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(value).write(to: url, options: .atomic)
        } catch {
            AppLogger.ui.error("\(self.label) could not be saved: \(error.localizedDescription)")
        }
    }
}

extension URL {
    /// `Application Support/musiccloud/<name>`, its folder created on demand,
    /// or `nil` when Application Support cannot be found.
    static func applicationSupportFile(named name: String) -> URL? {
        let fileManager = FileManager.default
        guard let base = try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                              appropriateFor: nil, create: true) else { return nil }
        let directory = base.appending(path: "musiccloud", directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appending(path: name)
    }
}
