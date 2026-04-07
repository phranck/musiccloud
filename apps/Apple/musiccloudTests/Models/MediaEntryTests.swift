import Foundation
import Testing
@testable import musiccloud

// MARK: - MediaEntryTests

struct MediaEntryTests {

    // MARK: ContentType derivation

    @Test func contentTypeReturnsTrackWhenTrackIsSet() {
        let entry = MediaEntry(
            originalUrl: "https://open.spotify.com/track/abc",
            shortUrl: "https://musiccloud.io/abc",
            mediaType: "track",
            track: TrackInfo(title: "Blinding Lights", artists: ["The Weeknd"])
        )
        if case .track(let info) = entry.contentType {
            #expect(info.title == "Blinding Lights")
            #expect(info.artists == ["The Weeknd"])
        } else {
            Issue.record("Expected .track content type")
        }
    }

    @Test func contentTypeReturnsAlbumWhenAlbumIsSet() {
        let entry = MediaEntry(
            originalUrl: "https://open.spotify.com/album/abc",
            shortUrl: "https://musiccloud.io/abc",
            mediaType: "album",
            album: AlbumInfo(title: "After Hours", artists: ["The Weeknd"])
        )
        if case .album(let info) = entry.contentType {
            #expect(info.title == "After Hours")
        } else {
            Issue.record("Expected .album content type")
        }
    }

    @Test func contentTypeReturnsArtistWhenArtistIsSet() {
        let entry = MediaEntry(
            originalUrl: "https://open.spotify.com/artist/abc",
            shortUrl: "https://musiccloud.io/abc",
            mediaType: "artist",
            artist: ArtistInfo(name: "The Weeknd")
        )
        if case .artist(let info) = entry.contentType {
            #expect(info.name == "The Weeknd")
        } else {
            Issue.record("Expected .artist content type")
        }
    }

    @Test func contentTypeFallsBackToEmptyTrack() {
        let entry = MediaEntry(
            originalUrl: "https://example.com",
            shortUrl: "https://musiccloud.io/abc",
            mediaType: "track"
        )
        if case .track(let info) = entry.contentType {
            #expect(info.title == "")
            #expect(info.artists.isEmpty)
        } else {
            Issue.record("Expected fallback .track content type")
        }
    }

    // MARK: Track priority over album

    @Test func trackTakesPriorityOverAlbum() {
        let entry = MediaEntry(
            originalUrl: "https://open.spotify.com/track/abc",
            shortUrl: "https://musiccloud.io/abc",
            mediaType: "track",
            track: TrackInfo(title: "Track", artists: ["A"]),
            album: AlbumInfo(title: "Album", artists: ["A"])
        )
        if case .track = entry.contentType {
            // Track takes priority -- expected
        } else {
            Issue.record("Expected .track when both track and album are set")
        }
    }

    // MARK: Default values

    @Test func defaultValuesAreCorrect() {
        let entry = MediaEntry(
            originalUrl: "https://test.com",
            shortUrl: "https://musiccloud.io/x",
            mediaType: "track"
        )
        #expect(entry.originalUrl == "https://test.com")
        #expect(entry.shortUrl == "https://musiccloud.io/x")
        #expect(entry.mediaType == "track")
        #expect(entry.artworkImageData == nil)
        #expect(entry.track == nil)
        #expect(entry.album == nil)
        #expect(entry.artist == nil)
        #expect(entry.serviceLinks.isEmpty)
    }

    // MARK: TrackInfo

    @Test func trackInfoArtistsString() {
        let info = TrackInfo(title: "Song", artists: ["Artist 1", "Artist 2", "Artist 3"])
        #expect(info.artistsString == "Artist 1, Artist 2, Artist 3")
    }

    @Test func trackInfoSingleArtist() {
        let info = TrackInfo(title: "Song", artists: ["Solo"])
        #expect(info.artistsString == "Solo")
    }

    @Test func trackInfoEmptyArtists() {
        let info = TrackInfo(title: "Song", artists: [])
        #expect(info.artistsString == "")
    }

    @Test func trackInfoFormattedDuration() {
        let info = TrackInfo(title: "Song", artists: [], durationMs: 225000)
        #expect(info.formattedDuration == "3:45")
    }

    @Test func trackInfoFormattedDurationShort() {
        let info = TrackInfo(title: "Song", artists: [], durationMs: 5000)
        #expect(info.formattedDuration == "0:05")
    }

    @Test func trackInfoNilDuration() {
        let info = TrackInfo(title: "Song", artists: [])
        #expect(info.formattedDuration == nil)
    }

    @Test func trackInfoReleaseYear() {
        let info = TrackInfo(title: "Song", artists: [], releaseDate: "2020-03-20")
        #expect(info.releaseYear == "2020")
    }

    @Test func trackInfoReleaseYearNil() {
        let info = TrackInfo(title: "Song", artists: [])
        #expect(info.releaseYear == nil)
    }

    // MARK: AlbumInfo

    @Test func albumInfoArtistsString() {
        let info = AlbumInfo(title: "Album", artists: ["A", "B"])
        #expect(info.artistsString == "A, B")
    }

    @Test func albumInfoReleaseYear() {
        let info = AlbumInfo(title: "Album", artists: [], releaseDate: "2023-01-15")
        #expect(info.releaseYear == "2023")
    }

    @Test func albumInfoReleaseYearNil() {
        let info = AlbumInfo(title: "Album", artists: [])
        #expect(info.releaseYear == nil)
    }

    // MARK: ArtistInfo

    @Test func artistInfoGenresString() {
        let info = ArtistInfo(name: "Artist", genres: ["Pop", "R&B"])
        #expect(info.genresString == "Pop, R&B")
    }

    @Test func artistInfoGenresNil() {
        let info = ArtistInfo(name: "Artist")
        #expect(info.genresString == nil)
    }

    @Test func artistInfoFormattedFollowersMillions() {
        let info = ArtistInfo(name: "Artist", followerCount: 1_500_000)
        #expect(info.formattedFollowers == "1.5M")
    }

    @Test func artistInfoFormattedFollowersThousands() {
        let info = ArtistInfo(name: "Artist", followerCount: 42_300)
        #expect(info.formattedFollowers == "42.3K")
    }

    @Test func artistInfoFormattedFollowersSmall() {
        let info = ArtistInfo(name: "Artist", followerCount: 99)
        #expect(info.formattedFollowers == "99")
    }

    @Test func artistInfoFormattedFollowersNil() {
        let info = ArtistInfo(name: "Artist")
        #expect(info.formattedFollowers == nil)
    }

    // MARK: ServiceLink

    @Test func serviceLinkEquality() {
        let a = ServiceLink(service: "spotify", displayName: "Spotify", url: "https://open.spotify.com/track/abc")
        let b = ServiceLink(service: "spotify", displayName: "Spotify", url: "https://open.spotify.com/track/abc")
        #expect(a == b)
    }

    @Test func serviceLinkCodable() throws {
        let link = ServiceLink(service: "spotify", displayName: "Spotify", url: "https://open.spotify.com/track/abc")
        let data = try JSONEncoder().encode(link)
        let decoded = try JSONDecoder().decode(ServiceLink.self, from: data)
        #expect(decoded == link)
    }
}
