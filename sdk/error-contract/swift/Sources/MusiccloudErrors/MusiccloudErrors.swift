import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum MusiccloudErrorCode {
    public static let authenticationRequired = "MC-AUTH-0001"
    public static let permissionDenied = "MC-AUTH-0002"
    public static let rateLimited = "MC-API-0003"
    public static let requestTimeout = "MC-API-0005"
    public static let invalidRequest = "MC-REQ-0001"
    public static let requestConflict = "MC-REQ-0002"
    public static let resourceNotFound = "MC-RES-0003"
    public static let unexpectedServerError = "MC-SYS-0001"
    public static let backendUnavailable = "MC-SYS-0002"
}

public enum MusiccloudContextValue: Equatable, Sendable {
    case string(String)
    case number(Double)
}

extension MusiccloudContextValue: Decodable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            throw DecodingError.typeMismatch(
                MusiccloudContextValue.self,
                .init(codingPath: decoder.codingPath, debugDescription: "Expected a string or number")
            )
        }
    }
}

public struct MusiccloudAPIError: Error, LocalizedError, CustomStringConvertible, Sendable {
    public let code: String
    public let safeMessage: String
    public let errorId: String
    public let status: Int
    public let context: [String: MusiccloudContextValue]?
    public let retryHeaders: [String: String]

    public var isAuthenticationError: Bool {
        status == 401 || status == 403 || code.hasPrefix("MC-AUTH-")
    }

    public var isRateLimitError: Bool {
        status == 429 || code == MusiccloudErrorCode.rateLimited
    }

    public var isRetryable: Bool {
        status == 408 || status == 429 || status >= 500
    }

    public var retryAfterSeconds: Double? {
        if let value = retryHeaders["retry-after"], let parsed = Double(value), parsed >= 0 {
            return parsed
        }
        guard let value = context?["retryAfterSeconds"] else { return nil }
        switch value {
        case .number(let number): return number >= 0 ? number : nil
        case .string(let string):
            guard let number = Double(string), number >= 0 else { return nil }
            return number
        }
    }

    public var description: String {
        "\(safeMessage) [\(code); errorId=\(errorId); status=\(status)]"
    }

    public var errorDescription: String? { description }
}

public struct MusiccloudProtocolError: Error, LocalizedError, CustomStringConvertible, Sendable {
    public enum Reason: String, Sendable {
        case emptyBody = "empty-body"
        case unexpectedContentType = "unexpected-content-type"
        case invalidJSON = "invalid-json"
        case invalidEnvelope = "invalid-envelope"
    }

    public let status: Int
    public let reason: Reason
    public let bodyLength: Int
    public let contentType: String?

    public var description: String {
        "MusicCloud returned an invalid error response (\(reason.rawValue); status=\(status))."
    }

    public var errorDescription: String? { description }
}

public struct MusiccloudTransportError: Error, LocalizedError, CustomStringConvertible, Sendable {
    public enum Kind: String, Sendable {
        case cancelled
        case timeout
        case dns
        case tls
        case network
    }

    public let kind: Kind

    public var description: String {
        "The MusicCloud request failed before an HTTP error response was received (\(kind.rawValue))."
    }

    public var errorDescription: String? { description }
}

public enum MusiccloudError: Error, LocalizedError, CustomStringConvertible, Sendable {
    case api(MusiccloudAPIError)
    case protocolFailure(MusiccloudProtocolError)
    case transportFailure(MusiccloudTransportError)

    public var description: String {
        switch self {
        case .api(let error): error.description
        case .protocolFailure(let error): error.description
        case .transportFailure(let error): error.description
        }
    }

    public var errorDescription: String? { description }

    public static func error(
        _ status: Int,
        _ data: Data?,
        _ response: URLResponse?,
        _ source: any Error
    ) -> MusiccloudError {
        if status > 0 {
            var headers: [String: String] = [:]
            if let httpResponse = response as? HTTPURLResponse {
                for (name, value) in httpResponse.allHeaderFields {
                    if let name = name as? String, let value = value as? String {
                        headers[name] = value
                    }
                }
            }
            return parseHTTPError(status: status, headers: headers, data: data ?? Data())
        }
        return transport(source)
    }

    public static func parseHTTPError(status: Int, headers: [String: String], data: Data) -> MusiccloudError {
        let normalizedHeaders = Dictionary(uniqueKeysWithValues: headers.map { ($0.key.lowercased(), $0.value) })
        let contentType = normalizedHeaders["content-type"]
        guard !data.isEmpty, let rawBody = String(data: data, encoding: .utf8), !rawBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .protocolFailure(.init(status: status, reason: .emptyBody, bodyLength: data.count, contentType: contentType))
        }

        if let contentType, !contentType.lowercased().contains("json") {
            return .protocolFailure(.init(status: status, reason: .unexpectedContentType, bodyLength: data.count, contentType: contentType))
        }

        guard (try? JSONSerialization.jsonObject(with: data)) != nil else {
            return .protocolFailure(.init(status: status, reason: .invalidJSON, bodyLength: data.count, contentType: contentType))
        }
        guard
            let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: data),
            envelope.isValid
        else {
            return .protocolFailure(.init(status: status, reason: .invalidEnvelope, bodyLength: data.count, contentType: contentType))
        }

        let context = envelope.context?.filter { !isSensitiveContextKey($0.key) }
        let retryHeaders = normalizedHeaders.filter { retryHeaderNames.contains($0.key) }
        return .api(.init(
            code: envelope.error,
            safeMessage: envelope.message,
            errorId: envelope.errorId,
            status: status,
            context: context?.isEmpty == false ? context : nil,
            retryHeaders: retryHeaders
        ))
    }

    public static func transport(_ source: any Error) -> MusiccloudError {
        if source is CancellationError {
            return .transportFailure(.init(kind: .cancelled))
        }
        guard let urlError = source as? URLError else {
            return .transportFailure(.init(kind: .network))
        }
        switch urlError.code {
        case .cancelled:
            return .transportFailure(.init(kind: .cancelled))
        case .timedOut:
            return .transportFailure(.init(kind: .timeout))
        case .cannotFindHost, .dnsLookupFailed:
            return .transportFailure(.init(kind: .dns))
        case .secureConnectionFailed,
             .serverCertificateHasBadDate,
             .serverCertificateUntrusted,
             .serverCertificateHasUnknownRoot,
             .clientCertificateRejected,
             .clientCertificateRequired:
            return .transportFailure(.init(kind: .tls))
        default:
            return .transportFailure(.init(kind: .network))
        }
    }
}

private struct ErrorEnvelope: Decodable {
    let error: String
    let message: String
    let errorId: String
    let context: [String: MusiccloudContextValue]?

    var isValid: Bool {
        error.range(of: #"^MC-(URL|API|AUTH|RES|DB|CFG|MAP|REQ|SYS)-\d{3,4}$"#, options: .regularExpression) != nil
            && !message.isEmpty
            && UUID(uuidString: errorId) != nil
    }
}

private let retryHeaderNames: Set<String> = [
    "retry-after",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
]

private func isSensitiveContextKey(_ key: String) -> Bool {
    let normalized = key.lowercased().replacingOccurrences(of: "_", with: "-")
    return normalized.contains("authorization")
        || normalized.contains("dpop")
        || normalized.contains("api-key")
        || normalized.contains("apikey")
        || normalized.contains("private-key")
        || normalized.contains("privatekey")
        || normalized.contains("password")
        || normalized.contains("secret")
        || normalized.contains("token")
}
