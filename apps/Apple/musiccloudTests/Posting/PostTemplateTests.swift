import Foundation
import Testing
@testable import musiccloud

// MARK: - PostTemplateRendererTests

struct PostTemplateRendererTests {
    private let track = PostContext(
        track: TrackInfo(title: "MoonDial", artists: ["Pat Metheny"], albumName: "MoonDial", durationMs: 383_000, releaseDate: "2024-07-26"),
        album: nil,
        artist: nil,
        shareURL: "https://musiccloud.io/3CCvY3vW",
        originalURL: "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt",
        serviceLinks: [ServiceLink(service: "spotify", displayName: "Spotify", url: "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt")]
    )

    @Test func variablesAreFilled() {
        let body = "Now playing: {song_name} by {artist} ({release_year}, {duration})\n{share_url}"
        #expect(PostTemplateRenderer.render(body, with: track)
            == "Now playing: MoonDial by Pat Metheny (2024, 6:23)\nhttps://musiccloud.io/3CCvY3vW")
    }

    @Test func serviceLinksResolveFromTheEntry() {
        #expect(PostTemplateRenderer.render("{spotify_url}", with: track) == "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt")
    }

    /// A line whose only content is a variable without a value goes, so a
    /// single track does not leave an empty "Tracks:" gap.
    @Test func lineWithOnlyAnEmptyVariableIsRemoved() {
        let body = "{song_name}\n{track_count}\n{share_url}"
        #expect(PostTemplateRenderer.render(body, with: track) == "MoonDial\nhttps://musiccloud.io/3CCvY3vW")
    }

    @Test func emptyLinesWrittenInTheTemplateStay() {
        #expect(PostTemplateRenderer.render("{song_name}\n\n#nowplaying", with: track) == "MoonDial\n\n#nowplaying")
    }

    @Test func unknownVariablesRenderAsNothing() {
        #expect(PostTemplateRenderer.render("{song_name} {nonsense} {tidal_url}", with: track) == "MoonDial  ")
    }

    @Test func textInBracesThatIsNoPlaceholderStays() {
        #expect(PostTemplateRenderer.render("{Not A Variable} {song_name}", with: track) == "{Not A Variable} MoonDial")
    }

    @Test func albumContextFillsAlbumFields() {
        let album = PostContext(
            track: nil,
            album: AlbumInfo(title: "Night Drive", artists: ["A", "B"], releaseDate: "2023-01-15", totalTracks: 11),
            artist: nil,
            shareURL: "https://musiccloud.io/x",
            originalURL: "",
            serviceLinks: []
        )
        #expect(PostTemplateRenderer.render("{album_name} by {artist}, {track_count} tracks, {release_year}", with: album)
            == "Night Drive by A, B, 11 tracks, 2023")
    }
}

// MARK: - PostTemplateStoreTests

@MainActor
struct PostTemplateStoreTests {
    private func temporaryFile() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "post-templates-\(UUID().uuidString).json")
    }

    @Test func templatesSurviveAReload() throws {
        let file = temporaryFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let store = PostTemplateStore(fileURL: file)
        let template = store.add(name: "Now playing", body: "{song_name}")
        var edited = template
        edited.body = "{song_name} by {artist}"
        store.update(edited)

        let reloaded = PostTemplateStore(fileURL: file)
        #expect(reloaded.templates == [edited])
    }

    @Test func deletingRemovesOnlyThatTemplate() {
        let store = PostTemplateStore(fileURL: nil)
        let first = store.add(name: "One")
        let second = store.add(name: "Two")
        store.delete(id: first.id)
        #expect(store.templates == [second])
    }

    /// A file that cannot be read is kept for the user rather than replaced by an empty list.
    @Test func unreadableFileIsNotOverwritten() throws {
        let file = temporaryFile()
        defer { try? FileManager.default.removeItem(at: file) }
        try Data("not json".utf8).write(to: file)

        let store = PostTemplateStore(fileURL: file)
        store.add(name: "New")
        #expect(try String(contentsOf: file, encoding: .utf8) == "not json")
    }
}
