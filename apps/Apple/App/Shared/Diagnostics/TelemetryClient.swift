//
//  TelemetryClient.swift
//  musiccloud
//
//  Created by Frank Gregor on 20.04.26.
//

import Foundation
import OSLog

// MARK: - TelemetryClient

/// Fire-and-forget client that ships ``TelemetryEvent`` payloads to the
/// backend. Calls are a no-op on App Store builds
/// (`BuildChannel.diagnosticsEnabled == false`).
///
/// ## Reliability
///
/// - Events that fail to POST are appended to a JSONL queue file in
///   `Application Support/telemetry-queue.jsonl`.
/// - `flushPending()` drains the queue on each subsequent launch and
///   before every new report, so transient network outages resolve
///   themselves without user interaction.
/// - All Keychain / disk / network work happens inside the actor, so
///   callers cannot race on the queue file.
actor TelemetryClient {

    static let shared = TelemetryClient()

    private let endpointPath = "/api/v1/telemetry/app-error"
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var queueURL: URL?
    private var flushed = false

    private init() {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    // MARK: Public surface

    /// Report one event. Returns immediately if diagnostics are
    /// disabled; otherwise attempts a live POST, falling back to the
    /// on-disk queue on failure.
    func report(_ event: TelemetryEvent) async {
        guard BuildChannel.diagnosticsEnabled else { return }
        await flushPendingIfNeeded()
        do {
            try await postOne(event)
        } catch {
            AppLogger.api.debug("telemetry: live POST failed, buffering (\(error.localizedDescription))")
            enqueue(event)
        }
    }

    /// Drain any queued events. Safe to call at app launch.
    func flushPending() async {
        guard BuildChannel.diagnosticsEnabled else { return }
        flushed = true
        guard let url = queueFileURL(), FileManager.default.fileExists(atPath: url.path) else { return }
        guard let data = try? Data(contentsOf: url), !data.isEmpty else { return }

        var remaining: [Data] = []
        for line in data.split(separator: 0x0A) {
            let eventData = Data(line)
            guard let event = try? decoder.decode(TelemetryEvent.self, from: eventData) else { continue }
            do {
                try await postOne(event)
            } catch {
                remaining.append(eventData)
            }
        }
        writeQueue(remaining)
    }

    // MARK: - Private

    private func flushPendingIfNeeded() async {
        if flushed { return }
        await flushPending()
    }

    private func postOne(_ event: TelemetryEvent) async throws {
        let endpoint = MusicCloudAPI.baseURL.appendingPathComponent(endpointPath)
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(event)

        let (_, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw TelemetryError.httpStatus(status)
        }
    }

    private func enqueue(_ event: TelemetryEvent) {
        guard let data = try? encoder.encode(event), let url = queueFileURL() else { return }
        var buffer = (try? Data(contentsOf: url)) ?? Data()
        buffer.append(data)
        buffer.append(0x0A)
        try? buffer.write(to: url, options: .atomic)
    }

    private func writeQueue(_ lines: [Data]) {
        guard let url = queueFileURL() else { return }
        if lines.isEmpty {
            try? FileManager.default.removeItem(at: url)
            return
        }
        var buffer = Data()
        for line in lines {
            buffer.append(line)
            buffer.append(0x0A)
        }
        try? buffer.write(to: url, options: .atomic)
    }

    private func queueFileURL() -> URL? {
        if let queueURL { return queueURL }
        let fm = FileManager.default
        guard let base = try? fm.url(for: .applicationSupportDirectory,
                                     in: .userDomainMask,
                                     appropriateFor: nil,
                                     create: true) else { return nil }
        let dir = base.appendingPathComponent("musiccloud", isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        let url = dir.appendingPathComponent("telemetry-queue.jsonl")
        queueURL = url
        return url
    }

    private enum TelemetryError: Error {
        case httpStatus(Int)
    }
}
