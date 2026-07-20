struct SharePayload: Sendable {}
struct SharePreviewPayload: Sendable {}

protocol MusicCloudClientProtocol: Sendable {
    func share(for shortID: String) async throws -> SharePayload
    func sharePreview(for shortID: String) async throws -> SharePreviewPayload
}

func shareQuickstart(
    client: some MusicCloudClientProtocol,
    shortID: String
) async throws -> (SharePayload, SharePreviewPayload) {
    let share = try await client.share(for: shortID)
    let preview = try await client.sharePreview(for: shortID)
    return (share, preview)
}
