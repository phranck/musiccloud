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
/// - Every reported event joins a queue held in the actor and mirrored to
///   `Application Support/musiccloud/telemetry-queue.jsonl`, so events
///   reported while offline are sent on a later launch.
/// - Only one flush runs at a time. A report during a flush waits for it,
///   so no event is sent twice and none is lost to a rewrite of the file.
/// - The queue keeps at most ``maximumQueuedEvents`` events, none older
///   than ``maximumEventAge``. An event the backend rejects with a client
///   error is dropped, because sending it again would be rejected again.
actor TelemetryClient {

    static let shared = TelemetryClient()

    /// The most events kept for a later attempt.
    static let maximumQueuedEvents = 100

    /// The oldest an event may be and still be sent, in seconds.
    static let maximumEventAge: TimeInterval = 7 * 24 * 60 * 60

    private let endpointPath = "/api/v1/telemetry/app-error"
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let session: URLSession
    private let queueURL: URL?

    /// Events not yet accepted by the backend. `nil` until read from disk.
    private var pending: [QueuedEvent]?
    private var flushTask: Task<Void, Never>?

    /// Creates a client.
    ///
    /// - Parameters:
    ///   - queueURL: Where the queue is kept between launches. `nil` keeps it in memory only.
    ///   - session: The session events are posted with.
    init(queueURL: URL? = TelemetryClient.defaultQueueURL(), session: URLSession = .shared) {
        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.queueURL = queueURL
        self.session = session
    }

    // MARK: Public surface

    /// Reports one event. Returns immediately if diagnostics are disabled;
    /// otherwise queues the event and sends everything that is queued.
    func report(_ event: TelemetryEvent) async {
        await BuildChannel.resolve()
        guard BuildChannel.diagnosticsEnabled else { return }
        await enqueue(event)
        await flushPending()
    }

    /// Sends the queued events. Safe to call at app launch.
    func flushPending() async {
        await BuildChannel.resolve()
        guard BuildChannel.diagnosticsEnabled else { return }
        await flushQueue()
    }

    /// The events waiting to be sent, oldest first.
    var queuedEvents: [TelemetryEvent] { loadedQueue().map(\.event) }

    // MARK: - Queue

    /// Adds an event, then trims the queue to its limits.
    func enqueue(_ event: TelemetryEvent, now: Date = Date()) async {
        var queue = loadedQueue()
        queue.append(QueuedEvent(id: UUID(), event: event))
        pending = Self.trimmed(queue, now: now)
        persist()
    }

    /// Sends every queued event once, one flush at a time.
    func flushQueue() async {
        if let flushTask {
            await flushTask.value
            return
        }
        let task = Task { await drain() }
        flushTask = task
        await task.value
        flushTask = nil
    }

    private func drain() async {
        for queued in loadedQueue() {
            switch await post(queued.event) {
            case .delivered, .rejected:
                pending?.removeAll { $0.id == queued.id }
                persist()
            case .retryLater: return
            }
        }
    }

    /// Drops events beyond the age limit and the oldest beyond the count limit.
    static func trimmed(_ queue: [QueuedEvent], now: Date) -> [QueuedEvent] {
        let fresh = queue.filter { now.timeIntervalSince($0.event.eventTime) <= maximumEventAge }
        return Array(fresh.suffix(maximumQueuedEvents))
    }

    // MARK: - Network

    private enum PostOutcome {
        case delivered
        /// The backend refused the event itself. Sending it again changes nothing.
        case rejected
        /// No answer, or one that a later attempt can change.
        case retryLater
    }

    private func post(_ event: TelemetryEvent) async -> PostOutcome {
        let endpoint = MusicCloudAPI.baseURL.appending(path: endpointPath)
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 10
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        guard let body = try? encoder.encode(event) else { return .rejected }
        request.httpBody = body

        do {
            let (_, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            return Self.outcome(forStatus: status)
        } catch {
            AppLogger.api.debug("telemetry: POST failed, keeping the event (\(error.localizedDescription))")
            return .retryLater
        }
    }

    /// Maps an HTTP status to what happens with the event.
    ///
    /// A client error means the backend will never accept this event, with
    /// two exceptions: 408 and 429 ask the client to come back later.
    private static func outcome(forStatus status: Int) -> PostOutcome {
        switch status {
        case 200..<300: .delivered
        case 408, 429: .retryLater
        case 400..<500: .rejected
        default: .retryLater
        }
    }

    // MARK: - Storage

    private func loadedQueue() -> [QueuedEvent] {
        if let pending { return pending }
        var queue: [QueuedEvent] = []
        if let queueURL, let data = try? Data(contentsOf: queueURL) {
            for line in data.split(separator: 0x0A) {
                if let queued = try? decoder.decode(QueuedEvent.self, from: Data(line)) { queue.append(queued) }
            }
        }
        let trimmedQueue = Self.trimmed(queue, now: Date())
        pending = trimmedQueue
        return trimmedQueue
    }

    private func persist() {
        guard let queueURL else { return }
        let queue = pending ?? []
        if queue.isEmpty {
            try? FileManager.default.removeItem(at: queueURL)
            return
        }
        var buffer = Data()
        for queued in queue {
            guard let line = try? encoder.encode(queued) else { continue }
            buffer.append(line)
            buffer.append(0x0A)
        }
        try? buffer.write(to: queueURL, options: .atomic)
    }

    /// `Application Support/musiccloud/telemetry-queue.jsonl`, created on demand.
    static func defaultQueueURL() -> URL? {
        let fileManager = FileManager.default
        guard let base = try? fileManager.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        else { return nil }
        let directory = base.appending(path: "musiccloud", directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appending(path: "telemetry-queue.jsonl")
    }
}

// MARK: - QueuedEvent

/// An event in the queue, with an id of its own.
///
/// The id lets a flush remove exactly the events it delivered while new
/// ones are appended during its network calls. It stays on the device:
/// only ``event`` is sent, because the backend rejects unknown fields.
struct QueuedEvent: Codable {
    let id: UUID
    let event: TelemetryEvent
}
