import Foundation
import Testing
@testable import musiccloud

// MARK: - TelemetryClientTests

struct TelemetryClientTests {

    private func event(sentAt date: Date = Date(), message: String = "failure") -> TelemetryEvent {
        TelemetryEvent(
            eventType: "resolve_error",
            eventTime: date,
            installId: "test-install",
            appVersion: "1.0",
            buildNumber: "1",
            platform: "macos",
            osVersion: "test",
            deviceModel: "test",
            locale: "en_US",
            sourceUrl: nil,
            service: nil,
            errorKind: "TEST",
            httpStatus: nil,
            message: message
        )
    }

    /// A client whose posts are answered by `protocolClass`, with its queue in memory.
    private func client(answeringWith protocolClass: URLProtocol.Type) -> TelemetryClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [protocolClass]
        return TelemetryClient(queueURL: nil, session: URLSession(configuration: configuration))
    }

    // MARK: Limits

    @Test func queueKeepsOnlyTheNewestEvents() async {
        let telemetry = TelemetryClient(queueURL: nil)
        for index in 0..<(TelemetryClient.maximumQueuedEvents + 20) { await telemetry.enqueue(event(message: "event \(index)")) }
        let queued = await telemetry.queuedEvents
        #expect(queued.count == TelemetryClient.maximumQueuedEvents)
        #expect(queued.last?.message == "event \(TelemetryClient.maximumQueuedEvents + 19)")
    }

    @Test func eventsOlderThanTheLimitAreDropped() async {
        let telemetry = TelemetryClient(queueURL: nil)
        let now = Date()
        await telemetry.enqueue(event(sentAt: now.addingTimeInterval(-TelemetryClient.maximumEventAge - 60), message: "old"), now: now)
        await telemetry.enqueue(event(sentAt: now, message: "new"), now: now)
        #expect(await telemetry.queuedEvents.map(\.message) == ["new"])
    }

    // MARK: Delivery

    @Test func deliveredEventsLeaveTheQueue() async {
        let telemetry = client(answeringWith: AcceptingProtocol.self)
        await telemetry.enqueue(event())
        await telemetry.flushQueue()
        #expect(await telemetry.queuedEvents.isEmpty)
    }

    @Test func rejectedEventsAreNotSentAgain() async {
        let telemetry = client(answeringWith: RejectingProtocol.self)
        await telemetry.enqueue(event())
        await telemetry.flushQueue()
        #expect(await telemetry.queuedEvents.isEmpty)
    }

    @Test func eventsStayQueuedWhileTheServerIsDown() async {
        let telemetry = client(answeringWith: UnavailableProtocol.self)
        await telemetry.enqueue(event())
        await telemetry.flushQueue()
        #expect(await telemetry.queuedEvents.count == 1)
    }

    @Test func eventsSurviveARelaunch() async throws {
        let queueURL = FileManager.default.temporaryDirectory.appendingPathComponent(
            "musiccloud-tests-telemetry-\(UUID().uuidString).jsonl"
        )
        defer { try? FileManager.default.removeItem(at: queueURL) }

        await TelemetryClient(queueURL: queueURL).enqueue(event(message: "kept"))
        let relaunched = TelemetryClient(queueURL: queueURL)
        #expect(await relaunched.queuedEvents.map(\.message) == ["kept"])
    }

    // MARK: Event content

    @Test func sourceUrlLosesItsTrackingParameters() {
        #expect(TelemetryEvent.withoutQuery("https://open.spotify.com/track/abc?si=123#x") == "https://open.spotify.com/track/abc")
    }
}

// MARK: - Stub responses

/// Answers every request with the status code of the subclass.
private class StatusProtocol: URLProtocol {
    class var statusCode: Int { 200 }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url,
            let response = HTTPURLResponse(url: url, statusCode: Self.statusCode, httpVersion: nil, headerFields: nil)
        else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private final class AcceptingProtocol: StatusProtocol { override class var statusCode: Int { 201 } }

private final class RejectingProtocol: StatusProtocol { override class var statusCode: Int { 400 } }

private final class UnavailableProtocol: StatusProtocol { override class var statusCode: Int { 503 } }
