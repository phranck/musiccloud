import Foundation
import Testing
@testable import MusiccloudErrors

private func loadFixture() -> [String: Any] {
    let fixtureURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("fixtures/http-errors.json")
    let data = try! Data(contentsOf: fixtureURL)
    return try! JSONSerialization.jsonObject(with: data) as! [String: Any]
}

@Test func parsesCanonicalAndFutureApiEnvelopes() throws {
    let fixture = loadFixture()
    let cases = fixture["apiErrors"] as! [[String: Any]]
    for item in cases {
        let body = item["body"] as! [String: Any]
        let error = MusiccloudError.parseHTTPError(
            status: item["status"] as! Int,
            headers: item["headers"] as! [String: String],
            data: try JSONSerialization.data(withJSONObject: body)
        )

        guard case .api(let apiError) = error else {
            Issue.record("Expected API error for \(item["name"]!)")
            continue
        }
        #expect(apiError.code == body["error"] as! String)
        #expect(apiError.safeMessage == body["message"] as! String)
        #expect(apiError.errorId == body["errorId"] as! String)
        #expect(apiError.status == item["status"] as! Int)
        #expect(apiError.description.contains(apiError.code))
        #expect(apiError.description.contains(apiError.errorId))
        #expect(error.description.contains(apiError.code))
        #expect(error.description.contains(apiError.errorId))
        #expect(error.errorDescription?.contains(apiError.errorId) == true)
    }
}

@Test func exposesAuthRateLimitAndRedactedRetryMetadata() throws {
    let fixture = loadFixture()
    let cases = fixture["apiErrors"] as! [[String: Any]]
    let authItem = cases.first { $0["status"] as? Int == 401 }!
    let rateItem = cases.first { $0["status"] as? Int == 429 }!
    var rateBody = rateItem["body"] as! [String: Any]
    var rateContext = rateBody["context"] as! [String: Any]
    rateContext["apiKey"] = "fixture-api-key"
    rateContext["privateKey"] = "fixture-private-key"
    rateContext["refreshToken"] = "fixture-refresh-token"
    rateBody["context"] = rateContext
    let auth = MusiccloudError.parseHTTPError(
        status: 401,
        headers: authItem["headers"] as! [String: String],
        data: try JSONSerialization.data(withJSONObject: authItem["body"]!)
    )
    let rateLimit = MusiccloudError.parseHTTPError(
        status: 429,
        headers: rateItem["headers"] as! [String: String],
        data: try JSONSerialization.data(withJSONObject: rateBody)
    )

    guard case .api(let authError) = auth, case .api(let rateError) = rateLimit else {
        Issue.record("Expected typed API errors")
        return
    }
    #expect(authError.isAuthenticationError)
    #expect(authError.code == MusiccloudErrorCode.authenticationRequired)
    #expect(rateError.isRateLimitError)
    #expect(rateError.isRetryable)
    #expect(rateError.retryAfterSeconds == 42)
    #expect(rateError.context?["privateKey"] == nil)
    #expect(rateError.context?["apiKey"] == nil)
    #expect(rateError.context?["refreshToken"] == nil)
    #expect(rateError.retryHeaders == [
        "retry-after": "42",
        "x-ratelimit-limit": "10",
        "x-ratelimit-remaining": "0",
    ])
    #expect(!rateError.description.contains("fixture-secret"))
    #expect(!rateError.description.contains("fixture-proof"))
    #expect(!rateError.description.contains("fixture-key"))
    #expect(!rateError.description.contains("fixture-private-key"))
    #expect(!rateError.description.contains("fixture-api-key"))
    #expect(!rateError.description.contains("fixture-refresh-token"))
    #expect(!rateLimit.description.contains("fixture-refresh-token"))
    #expect(!rateLimit.description.contains("fixture-api-key"))
}

@Test func keepsInvalidResponsesAsProtocolFailures() {
    let fixture = loadFixture()
    let cases = fixture["protocolErrors"] as! [[String: Any]]
    for item in cases {
        let data = (item["body"] as! String).data(using: .utf8)!
        let error = MusiccloudError.parseHTTPError(
            status: item["status"] as! Int,
            headers: item["headers"] as! [String: String],
            data: data
        )
        guard case .protocolFailure(let protocolError) = error else {
            Issue.record("Expected protocol failure for \(item["name"]!)")
            continue
        }
        #expect(protocolError.reason.rawValue == item["reason"] as! String)
        #expect(protocolError.bodyLength == data.count)
        #expect(protocolError.contentType == "application/json" || protocolError.contentType == "text/html")
        #expect(!protocolError.description.contains("fixture-secret"))
        #expect(!protocolError.description.contains("Authorization"))
    }
}

@Test func classifiesTransportFailures() {
    let cases: [(URLError, MusiccloudTransportError.Kind)] = [
        (URLError(.cancelled), .cancelled),
        (URLError(.timedOut), .timeout),
        (URLError(.cannotFindHost), .dns),
        (URLError(.secureConnectionFailed), .tls),
        (URLError(.networkConnectionLost), .network),
    ]

    for (source, kind) in cases {
        let error = MusiccloudError.transport(source)
        guard case .transportFailure(let transportError) = error else {
            Issue.record("Expected transport failure")
            continue
        }
        #expect(transportError.kind == kind)
    }
}
