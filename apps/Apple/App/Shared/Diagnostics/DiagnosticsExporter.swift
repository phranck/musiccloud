//
//  DiagnosticsExporter.swift
//  musiccloud
//
//  Created by Frank Gregor on 20.04.26.
//

import Foundation
import OSLog

// MARK: - DiagnosticsExporter

/// Reads the Unified Log for the `io.musiccloud.app` subsystem and
/// writes a newline-delimited JSON file suitable for a share sheet.
///
/// Only the current process's entries are available to ``OSLogStore``
/// without elevated entitlements, so the tester must reproduce the
/// issue within the same app launch they hit the export button for the
/// output to be useful. The window below is bounded, because a full log
/// read can take seconds on a device.
enum DiagnosticsExporter {

    private static let lookBack: TimeInterval = 60 * 60 * 6 // 6 hours
    private static let maxEntries = 5_000

    /// Errors raised during export. Surfaced to the UI so the caller can
    /// show a toast; the share sheet is not presented on failure.
    enum ExportError: Error {
        case unavailable
    }

    /// Produce a JSONL file of recent log entries for the musiccloud
    /// subsystem and return its URL.
    ///
    /// The file is handed to a share sheet, which may still be reading it
    /// after it closes, for example during an AirDrop transfer. So it is not
    /// deleted after sharing. Each export removes the previous ones instead,
    /// which leaves at most one file of logs on the device.
    ///
    /// Reading the log store blocks for as long as it takes, so this runs on
    /// the concurrent pool rather than on the caller's actor.
    @concurrent
    static func exportLogs() async throws -> URL {
        guard let store = try? OSLogStore(scope: .currentProcessIdentifier) else {
            throw ExportError.unavailable
        }
        let start = store.position(date: Date(timeIntervalSinceNow: -lookBack))
        let predicate = NSPredicate(format: "subsystem == %@", "io.musiccloud.app")
        let entries = try store.getEntries(at: start, matching: predicate)

        var buffer = Data()
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        var count = 0
        for entry in entries {
            guard let log = entry as? OSLogEntryLog else { continue }
            if count >= maxEntries { break }
            let record = LogRecord(
                timestamp: log.date,
                level: Self.levelString(for: log.level),
                category: log.category,
                message: log.composedMessage
            )
            if let data = try? encoder.encode(record) {
                buffer.append(data)
                buffer.append(0x0A)
                count += 1
            }
        }

        if buffer.isEmpty {
            let placeholder = LogRecord(
                timestamp: Date(),
                level: "info",
                category: "exporter",
                message: "No log entries captured in the last \(Int(lookBack)) seconds."
            )
            buffer = (try? encoder.encode(placeholder)) ?? Data()
            buffer.append(0x0A)
        }

        let directory = FileManager.default.temporaryDirectory
            .appending(path: "musiccloud-diagnostics", directoryHint: .isDirectory)
        try? FileManager.default.removeItem(at: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appending(path: "musiccloud-diagnostics-\(UUID().uuidString.prefix(8)).jsonl")
        try buffer.write(to: file, options: [.atomic, .completeFileProtection])
        return file
    }

    private static func levelString(for level: OSLogEntryLog.Level) -> String {
        switch level {
        case .undefined: return "undefined"
        case .debug: return "debug"
        case .info: return "info"
        case .notice: return "notice"
        case .error: return "error"
        case .fault: return "fault"
        @unknown default: return "unknown"
        }
    }

    /// JSONL shape written to disk. Keys are short so a
    /// `jq '.category, .message'` stays readable.
    private struct LogRecord: Codable {
        let timestamp: Date
        let level: String
        let category: String
        let message: String
    }
}
