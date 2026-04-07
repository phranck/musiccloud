import Testing
@testable import musiccloud

// MARK: - StreamingServicesTests

struct StreamingServicesTests {

    // MARK: Major Platforms

    @Test func spotifyTrackURL() {
        #expect(StreamingServices.isStreamingURL("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"))
    }

    @Test func spotifyPlayURL() {
        #expect(StreamingServices.isStreamingURL("https://play.spotify.com/track/abc123"))
    }

    @Test func appleMusicURL() {
        #expect(StreamingServices.isStreamingURL("https://music.apple.com/us/album/after-hours/1499378108"))
    }

    @Test func youtubeURL() {
        #expect(StreamingServices.isStreamingURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
    }

    @Test func youtubeMusicURL() {
        #expect(StreamingServices.isStreamingURL("https://music.youtube.com/watch?v=abc123"))
    }

    @Test func youtubeShortURL() {
        #expect(StreamingServices.isStreamingURL("https://youtu.be/dQw4w9WgXcQ"))
    }

    @Test func tidalURL() {
        #expect(StreamingServices.isStreamingURL("https://tidal.com/browse/track/123456"))
    }

    @Test func tidalListenURL() {
        #expect(StreamingServices.isStreamingURL("https://listen.tidal.com/track/123456"))
    }

    @Test func deezerURL() {
        #expect(StreamingServices.isStreamingURL("https://www.deezer.com/track/12345"))
    }

    @Test func soundcloudURL() {
        #expect(StreamingServices.isStreamingURL("https://soundcloud.com/artist/track-name"))
    }

    // MARK: Regional & Specialized

    @Test func audiusURL() {
        #expect(StreamingServices.isStreamingURL("https://audius.co/artist/track"))
    }

    @Test func napsterURL() {
        #expect(StreamingServices.isStreamingURL("https://play.napster.com/track/tra.123"))
    }

    @Test func pandoraURL() {
        #expect(StreamingServices.isStreamingURL("https://www.pandora.com/artist/track"))
    }

    @Test func qobuzURL() {
        #expect(StreamingServices.isStreamingURL("https://open.qobuz.com/album/abc123"))
    }

    @Test func boomplayURL() {
        #expect(StreamingServices.isStreamingURL("https://www.boomplay.com/songs/123"))
    }

    @Test func kkboxURL() {
        #expect(StreamingServices.isStreamingURL("https://www.kkbox.com/tw/tc/song/abc"))
    }

    @Test func audiomackURL() {
        #expect(StreamingServices.isStreamingURL("https://audiomack.com/artist/song/track"))
    }

    @Test func neteaseURL() {
        #expect(StreamingServices.isStreamingURL("https://music.163.com/song?id=12345"))
    }

    @Test func qqMusicURL() {
        #expect(StreamingServices.isStreamingURL("https://y.qq.com/n/ryqq/songDetail/001abc"))
    }

    @Test func melonURL() {
        #expect(StreamingServices.isStreamingURL("https://www.melon.com/song/detail.htm?songId=123"))
    }

    @Test func bugsURL() {
        #expect(StreamingServices.isStreamingURL("https://music.bugs.co.kr/track/123"))
    }

    @Test func jiosaavnURL() {
        #expect(StreamingServices.isStreamingURL("https://www.jiosaavn.com/song/abc/def"))
    }

    @Test func beatportURL() {
        #expect(StreamingServices.isStreamingURL("https://www.beatport.com/track/name/123"))
    }

    // MARK: Bandcamp (suffix matching)

    @Test func bandcampSubdomainURL() {
        #expect(StreamingServices.isStreamingURL("https://artistname.bandcamp.com/album/cool-album"))
    }

    @Test func bandcampBareURL() {
        #expect(StreamingServices.isStreamingURL("https://bandcamp.com/discover"))
    }

    // MARK: Invalid URLs

    @Test func invalidDomain() {
        #expect(!StreamingServices.isStreamingURL("https://example.com/track/123"))
    }

    @Test func notAURL() {
        #expect(!StreamingServices.isStreamingURL("not a url at all"))
    }

    @Test func emptyString() {
        #expect(!StreamingServices.isStreamingURL(""))
    }

    @Test func plainText() {
        #expect(!StreamingServices.isStreamingURL("Hello World"))
    }

    @Test func tooLongString() {
        let long = "https://open.spotify.com/" + String(repeating: "x", count: 500)
        #expect(!StreamingServices.isStreamingURL(long))
    }

    @Test func ftpScheme() {
        #expect(!StreamingServices.isStreamingURL("ftp://open.spotify.com/track/abc"))
    }

    @Test func noScheme() {
        #expect(!StreamingServices.isStreamingURL("open.spotify.com/track/abc"))
    }

    @Test func httpSchemeAllowed() {
        #expect(StreamingServices.isStreamingURL("http://open.spotify.com/track/abc"))
    }

    @Test func googleURL() {
        #expect(!StreamingServices.isStreamingURL("https://www.google.com/search?q=spotify"))
    }

    @Test func spotifyLookalikeSubdomain() {
        #expect(!StreamingServices.isStreamingURL("https://fake.open.spotify.com.evil.com/track"))
    }
}
