#if os(macOS)
import Foundation
import Testing
@testable import musiccloud

// MARK: - NativeAppLinkTests

struct NativeAppLinkTests {
    private func appURL(_ string: String) throws -> String? { NativeAppLink.appURL(for: try #require(URL(string: string)))?.absoluteString }

    @Test(arguments: [
        ("https://open.spotify.com/intl-de/track/2Wn8X6fqkNihu33aV9YesP?si=8ca35981279e4da4", "spotify:track:2Wn8X6fqkNihu33aV9YesP"),
        ("https://open.spotify.com/track/3sn5gqosgrs0y1ljACKUCt", "spotify:track:3sn5gqosgrs0y1ljACKUCt"),
        ("https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo", "spotify:album:1A2GTWGtFfWp7KSQTwWOyo"),
        ("https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF", "spotify:artist:0OdUWJ0sBjDrqHygGUXeCF"),
    ]) func spotifyWebLinksBecomeSpotifyURIs(_ web: String, _ expected: String) throws { #expect(try appURL(web) == expected) }

    @Test(arguments: ["https://open.spotify.com/", "https://open.spotify.com/user/someone", "https://open.spotify.com/track/abc%2F.."])
    func otherSpotifyPathsKeepTheirWebLink(_ web: String) throws { #expect(try appURL(web) == nil) }

    @Test func appleMusicLinksOpenInMusic() throws {
        let web = "https://music.apple.com/at/album/moondial/1735112917?i=1735112918"
        #expect(try appURL(web) == "music://music.apple.com/at/album/moondial/1735112917?i=1735112918")
    }

    @Test(arguments: ["https://www.deezer.com/track/123", "https://tidal.com/browse/track/123"]) func unverifiedServicesKeepTheirWebLink(
        _ web: String
    ) throws { #expect(try appURL(web) == nil) }
}
#endif
