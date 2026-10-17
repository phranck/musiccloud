import Foundation
import Testing
@testable import musiccloud

// MARK: - PostTemplateRendererTests

struct PostTemplateRendererTests {
    private let track = PostContext(
        track: TrackInfo(
            title: "MoonDial",
            artists: ["Pat Metheny"],
            albumName: "MoonDial",
            durationMs: 383_000,
            releaseDate: "2024-07-26"
        ),
        album: nil,
        artist: nil,
        shareURL: "https://musiccloud.io/3CCvY3vW",
        originalURL: "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt",
        serviceLinks: [
            ServiceLink(service: "spotify", displayName: "Spotify", url: "https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt")
        ]
    )

    @Test func variablesAreFilled() {
        let body = "Now playing: {song_name} by {artist} ({release_year}, {duration})\n{share_url}"
        #expect(
            PostTemplateRenderer.render(body, with: track)
                == "Now playing: MoonDial by Pat Metheny (2024, 6:23)\nhttps://musiccloud.io/3CCvY3vW"
        )
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
        #expect(
            PostTemplateRenderer.render("{album_name} by {artist}, {track_count} tracks, {release_year}", with: album)
                == "Night Drive by A, B, 11 tracks, 2023"
        )
    }
}

// MARK: - SystemTemplateTests

struct SystemTemplateTests {
    /// A misspelled variable would render as nothing in every post made with it.
    @Test func systemTemplatesUseOnlyKnownVariables() throws {
        let known = Set(PostVariable.allCases.map(\.token))
        for template in PostTemplate.system {
            let placeholders = template.body.matches(of: /\{[a-z_]+\}/).map { String($0.output) }
            #expect(!placeholders.isEmpty)
            #expect(placeholders.allSatisfy(known.contains), "\(template.name)")
        }
    }

    /// Automatic posting rules name a template by id, so the ids are fixed and distinct.
    @Test func systemTemplateIDsAreDistinct() {
        let ids = PostTemplate.system.map(\.id)
        #expect(ids.count == 2)
        #expect(Set(ids).count == ids.count)
    }
}

// MARK: - PostTemplateStoreTests

@MainActor struct PostTemplateStoreTests {
    /// A file in a folder whose name has a space, like "Application Support",
    /// so a path that is percent-encoded by mistake fails here as it does there.
    private func temporaryFile() -> URL {
        let folder = FileManager.default.temporaryDirectory.appending(path: "post templates \(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appending(path: "post-templates.json")
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

    /// Two copies of the app share the file; neither may overwrite the other's templates.
    @Test func secondCopyKeepsTheFirstCopysTemplates() throws {
        let file = temporaryFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let first = PostTemplateStore(fileURL: file, systemTemplates: [])
        let second = PostTemplateStore(fileURL: file, systemTemplates: [])
        let one = first.add(name: "One")
        let two = second.add(name: "Two")
        #expect(PostTemplateStore(fileURL: file, systemTemplates: []).templates.map(\.id) == [one.id, two.id])
    }

    @Test func deletingRemovesOnlyThatTemplate() {
        let store = PostTemplateStore(fileURL: nil)
        let first = store.add(name: "One")
        let second = store.add(name: "Two")
        store.delete(id: first.id)
        #expect(store.templates == [second])
    }

    /// A system template is never stored or deleted; its copy is the user's own.
    @Test func systemTemplateIsCopiedNotChanged() {
        let system = PostTemplate(name: "Now playing", body: "{song_name}")
        let store = PostTemplateStore(fileURL: nil, systemTemplates: [system])
        #expect(store.isSystem(system.id))

        store.delete(id: system.id)
        var edited = system
        edited.body = "changed"
        store.update(edited)
        #expect(store.systemTemplates == [system])
        #expect(store.templates.isEmpty)

        let copy = store.duplicate(system)
        #expect(copy.id != system.id)
        #expect(copy.body == system.body)
        #expect(copy.name != system.name)
        #expect(!store.isSystem(copy.id))
        #expect(store.templates == [copy])
    }

    /// Templates stored before icons existed, and icons a later version
    /// added, load without an icon instead of failing the whole file.
    @Test func templatesWithoutOrWithUnknownIconsLoad() throws {
        let json = #"""
            [
              {"id":"6C1E5C32-6F5B-4D7B-9C4E-1A2B3C4D5E6F","name":"Old","body":"{song_name}"},
              {"id":"7D2F6D43-7A6C-4E8C-AD5F-2B3C4D5E6F70","name":"Future","body":"x","icon":"threads"},
              {"id":"8E307E54-8B7D-4F9D-BE60-3C4D5E6F7081","name":"Toot","body":"y","icon":"mastodon"}
            ]
            """#
        let templates = try JSONDecoder().decode([PostTemplate].self, from: Data(json.utf8))
        #expect(templates.map(\.icon) == [nil, nil, .mastodon])
    }

    @Test func iconSurvivesAReload() throws {
        let file = temporaryFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let store = PostTemplateStore(fileURL: file, systemTemplates: [])
        var template = store.add(name: "Skeet")
        template.icon = .bluesky
        store.update(template)
        #expect(PostTemplateStore(fileURL: file, systemTemplates: []).templates.first?.icon == .bluesky)
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
