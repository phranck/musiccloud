import Foundation
import SwiftUI
import Testing
#if os(macOS)
import AppKit
#else
import UIKit
#endif
@testable import musiccloud

// MARK: - StreamingServicesTests

struct StreamingServicesTests {

    /// Rendering the real Audius mark preserves its gradient instead of flattening it into one template color.
    @MainActor @Test func brandIconPreservesOriginalColors() throws {
        let service = try #require(StreamingServices.all.first { $0.id == "audius" })
        let renderer = ImageRenderer(content: StreamingServiceBrandIcon(service: service).environment(\.colorScheme, .light))
        renderer.scale = 3
        let image = try #require(renderer.cgImage)
        #expect(image.width == 60)
        #expect(image.height == 60)
        let width = image.width
        let height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let space = try #require(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try #require(
            CGContext(
                data: &pixels,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
        )
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        var colors = Set<UInt32>()
        for offset in stride(from: 0, to: pixels.count, by: 4) where pixels[offset + 3] == 255 {
            let red = pixels[offset]
            let green = pixels[offset + 1]
            let blue = pixels[offset + 2]
            if Int(max(red, green, blue)) - Int(min(red, green, blue)) > 40 {
                colors.insert(UInt32(red) << 16 | UInt32(green) << 8 | UInt32(blue))
            }
        }
        #expect(colors.count > 8, "The original gradient must survive asset loading and SwiftUI rendering")
    }

    /// Every supported service ships a real bundled brand mark rather than a placeholder.
    @MainActor @Test func everyServiceHasABundledBrandIcon() {
        for service in StreamingServices.all {
            #if os(macOS)
            #expect(NSImage(named: service.iconAssetName) != nil, "Missing brand icon for \(service.displayName)")
            #else
            #expect(UIImage(named: service.iconAssetName) != nil, "Missing brand icon for \(service.displayName)")
            #endif
        }
    }

    // MARK: Major Platforms

    @Test func spotifyTrackURL() { #expect(StreamingServices.isStreamingURL("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")) }

    @Test func spotifyPlayURL() { #expect(StreamingServices.isStreamingURL("https://play.spotify.com/track/abc123")) }

    @Test func appleMusicURL() { #expect(StreamingServices.isStreamingURL("https://music.apple.com/us/album/after-hours/1499378108")) }

    @Test func youtubeURL() { #expect(StreamingServices.isStreamingURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")) }

    @Test func youtubeMusicURL() { #expect(StreamingServices.isStreamingURL("https://music.youtube.com/watch?v=abc123")) }

    @Test func youtubeShortURL() { #expect(StreamingServices.isStreamingURL("https://youtu.be/dQw4w9WgXcQ")) }

    @Test func tidalURL() { #expect(StreamingServices.isStreamingURL("https://tidal.com/browse/track/123456")) }

    @Test func tidalListenURL() { #expect(StreamingServices.isStreamingURL("https://listen.tidal.com/track/123456")) }

    @Test func deezerURL() { #expect(StreamingServices.isStreamingURL("https://www.deezer.com/track/12345")) }

    @Test func soundcloudURL() { #expect(StreamingServices.isStreamingURL("https://soundcloud.com/artist/track-name")) }

    // MARK: Regional & Specialized

    @Test func audiusURL() { #expect(StreamingServices.isStreamingURL("https://audius.co/artist/track")) }

    @Test func napsterURL() { #expect(StreamingServices.isStreamingURL("https://play.napster.com/track/tra.123")) }

    @Test func pandoraURL() { #expect(StreamingServices.isStreamingURL("https://www.pandora.com/artist/track")) }

    @Test func qobuzURL() { #expect(StreamingServices.isStreamingURL("https://open.qobuz.com/album/abc123")) }

    @Test func boomplayURL() { #expect(StreamingServices.isStreamingURL("https://www.boomplay.com/songs/123")) }

    @Test func kkboxURL() { #expect(StreamingServices.isStreamingURL("https://www.kkbox.com/tw/tc/song/abc")) }

    @Test func audiomackURL() { #expect(StreamingServices.isStreamingURL("https://audiomack.com/artist/song/track")) }

    @Test func neteaseURL() { #expect(StreamingServices.isStreamingURL("https://music.163.com/song?id=12345")) }

    @Test func qqMusicURL() { #expect(StreamingServices.isStreamingURL("https://y.qq.com/n/ryqq/songDetail/001abc")) }

    @Test func melonURL() { #expect(StreamingServices.isStreamingURL("https://www.melon.com/song/detail.htm?songId=123")) }

    @Test func bugsURL() { #expect(StreamingServices.isStreamingURL("https://music.bugs.co.kr/track/123")) }

    @Test func jiosaavnURL() { #expect(StreamingServices.isStreamingURL("https://www.jiosaavn.com/song/abc/def")) }

    @Test func beatportURL() { #expect(StreamingServices.isStreamingURL("https://www.beatport.com/track/name/123")) }

    // MARK: Bandcamp (suffix matching)

    @Test func bandcampSubdomainURL() { #expect(StreamingServices.isStreamingURL("https://artistname.bandcamp.com/album/cool-album")) }

    @Test func bandcampBareURL() { #expect(StreamingServices.isStreamingURL("https://bandcamp.com/discover")) }

    // MARK: Invalid URLs

    @Test func invalidDomain() { #expect(!StreamingServices.isStreamingURL("https://example.com/track/123")) }

    @Test func notAURL() { #expect(!StreamingServices.isStreamingURL("not a url at all")) }

    @Test func emptyString() { #expect(!StreamingServices.isStreamingURL("")) }

    @Test func plainText() { #expect(!StreamingServices.isStreamingURL("Hello World")) }

    @Test func tooLongString() {
        let long = "https://open.spotify.com/" + String(repeating: "x", count: 500)
        #expect(!StreamingServices.isStreamingURL(long))
    }

    @Test func ftpScheme() { #expect(!StreamingServices.isStreamingURL("ftp://open.spotify.com/track/abc")) }

    @Test func noScheme() { #expect(!StreamingServices.isStreamingURL("open.spotify.com/track/abc")) }

    @Test func httpSchemeAllowed() { #expect(StreamingServices.isStreamingURL("http://open.spotify.com/track/abc")) }

    @Test func googleURL() { #expect(!StreamingServices.isStreamingURL("https://www.google.com/search?q=spotify")) }

    @Test func spotifyLookalikeSubdomain() { #expect(!StreamingServices.isStreamingURL("https://fake.open.spotify.com.evil.com/track")) }

    // MARK: Web URLs

    @Test(arguments: [
        "file:///etc/passwd", "tel:+431234567", "x-apple.systempreferences:com.apple.preference.security", "spotify:track:abc",
        "javascript:alert(1)", "https://", "not a url",
    ]) func webURLRefusesEverythingButWebAddresses(_ address: String) { #expect(StreamingServices.webURL(address) == nil) }

    @Test(arguments: ["https://musiccloud.io/abc", "http://localhost:3000/abc", "HTTPS://Open.Spotify.com/track/x"])
    func webURLAcceptsWebAddresses(_ address: String) { #expect(StreamingServices.webURL(address) != nil) }

    // MARK: Deep Link

    @Test func deepLinkReturnsStreamingURL() throws {
        let link = try #require(URL(string: "musiccloud://resolve?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fabc"))
        #expect(StreamingServices.streamingURL(fromDeepLink: link) == "https://open.spotify.com/track/abc")
    }

    @Test(arguments: [
        "musiccloud://resolve?url=hello", "musiccloud://resolve?url=https%3A%2F%2Fexample.com%2Fpage",
        "musiccloud://resolve?url=file%3A%2F%2F%2Fetc%2Fpasswd", "musiccloud://other?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fabc",
        "https://resolve?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fabc", "musiccloud://resolve",
    ]) func deepLinkRefusesAnythingElse(_ link: String) throws {
        let url = try #require(URL(string: link))
        #expect(StreamingServices.streamingURL(fromDeepLink: url) == nil)
    }

    // MARK: Service Toggles

    /// Each mutation uses a new preference domain, so parallel URL tests remain independent.
    @Test func disabledServiceIsNotDetected() throws {
        try withIsolatedDefaults { defaults in
            let spotify = try #require(StreamingServices.all.first { $0.id == "spotify" })
            #expect(StreamingServices.isStreamingURL("https://open.spotify.com/track/abc", defaults: defaults))
            StreamingServices.setEnabled(false, for: spotify, defaults: defaults)
            #expect(!StreamingServices.isStreamingURL("https://open.spotify.com/track/abc", defaults: defaults))
        }
    }

    /// Enabling a disabled service restores detection in the same persistent store.
    @Test func reenabledServiceIsDetectedAgain() throws {
        try withIsolatedDefaults { defaults in
            let spotify = try #require(StreamingServices.all.first { $0.id == "spotify" })
            StreamingServices.setEnabled(false, for: spotify, defaults: defaults)
            StreamingServices.setEnabled(true, for: spotify, defaults: defaults)
            #expect(StreamingServices.isStreamingURL("https://open.spotify.com/track/abc", defaults: defaults))
        }
    }

    /// A choice for Spotify cannot disable a different provider.
    @Test func disablingOneServiceLeavesOthersDetected() throws {
        try withIsolatedDefaults { defaults in
            let spotify = try #require(StreamingServices.all.first { $0.id == "spotify" })
            StreamingServices.setEnabled(false, for: spotify, defaults: defaults)
            #expect(StreamingServices.isStreamingURL("https://www.deezer.com/track/12345", defaults: defaults))
        }
    }

    /// A missing preference defaults to enabled without writing into shared app settings.
    @Test func unknownServiceIsEnabledByDefault() throws {
        try withIsolatedDefaults { defaults in
            let service = StreamingServices.Service(id: "test.unknown", displayName: "Test Service", exactDomains: ["example.test"])
            #expect(StreamingServices.isEnabled(service, defaults: defaults))
        }
    }

    /// The disabled choice persists while a different preference domain stays unaffected.
    @Test func serviceChoiceIsStoredAndDoesNotLeakToAnotherStore() throws {
        try withIsolatedDefaults { defaults in
            try withIsolatedDefaults { other in
                let spotify = try #require(StreamingServices.all.first { $0.id == "spotify" })
                StreamingServices.setEnabled(false, for: spotify, defaults: defaults)
                #expect(!StreamingServices.isEnabled(spotify, defaults: defaults))
                #expect(StreamingServices.isEnabled(spotify, defaults: other))
                #expect(defaults.stringArray(forKey: DefaultsKey.disabledStreamingServices) == [spotify.id])
            }
        }
    }

    /// Bulk changes persist every known service while preserving unrelated future IDs.
    @Test func bulkSelectionDisablesAndEnablesEveryService() throws {
        try withIsolatedDefaults { defaults in
            defaults.set(["future.service"], forKey: DefaultsKey.disabledStreamingServices)
            StreamingServices.setAllEnabled(false, defaults: defaults)
            #expect(StreamingServices.all.allSatisfy { !StreamingServices.isEnabled($0, defaults: defaults) })
            #expect(!StreamingServices.allEnabled(defaults: defaults))
            StreamingServices.setAllEnabled(true, defaults: defaults)
            #expect(StreamingServices.allEnabled(defaults: defaults))
            #expect(defaults.stringArray(forKey: DefaultsKey.disabledStreamingServices) == ["future.service"])
        }
    }

    /// An individual off choice immediately changes the aggregate state.
    @Test func aggregateSelectionReflectsIndividualChanges() throws {
        try withIsolatedDefaults { defaults in
            let spotify = try #require(StreamingServices.all.first { $0.id == "spotify" })
            #expect(StreamingServices.allEnabled(defaults: defaults))
            StreamingServices.setEnabled(false, for: spotify, defaults: defaults)
            #expect(!StreamingServices.allEnabled(defaults: defaults))
            StreamingServices.setAllEnabled(true, defaults: defaults)
            #expect(StreamingServices.isEnabled(spotify, defaults: defaults))
            #expect(StreamingServices.allEnabled(defaults: defaults))
        }
    }

    /// Deep links use the same persisted service choice as clipboard and explicit paste validation.
    @Test func deepLinkIgnoresDisabledServices() throws {
        try withIsolatedDefaults { defaults in
            let spotify = try #require(StreamingServices.all.first { $0.id == "spotify" })
            let link = try #require(URL(string: "musiccloud://resolve?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fabc"))
            StreamingServices.setEnabled(false, for: spotify, defaults: defaults)
            #expect(StreamingServices.streamingURL(fromDeepLink: link, defaults: defaults) == nil)
            StreamingServices.setEnabled(true, for: spotify, defaults: defaults)
            #expect(StreamingServices.streamingURL(fromDeepLink: link, defaults: defaults) != nil)
        }
    }
}

private extension StreamingServicesTests {
    /// Runs a synchronous assertion against preferences owned and removed by this test only.
    /// - Parameter test: The assertions receiving a unique, initially empty defaults suite.
    func withIsolatedDefaults(_ test: (UserDefaults) throws -> Void) throws {
        let suite = "StreamingServicesTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        try test(defaults)
    }
}
