import Foundation
import Testing
@testable import musiccloud

/// The share extension reads `public.plain-text` bytes through
/// ``PlainTextItem``, because Spotify sends a keyed archive under that type.
struct PlainTextItemTests {
    private let link = "https://open.spotify.com/track/3bEoJn1bacU7dhpcjmWw72?si=abc"

    @Test func readsUTF8Text() {
        #expect(PlainTextItem.text(from: Data(link.utf8)) == link)
    }

    @Test func readsAnArchivedString() throws {
        let data = try NSKeyedArchiver.archivedData(withRootObject: link as NSString, requiringSecureCoding: true)
        #expect(PlainTextItem.text(from: data) == link)
    }

    @Test func readsAnArchivedURL() throws {
        let url = try #require(URL(string: link))
        let data = try NSKeyedArchiver.archivedData(withRootObject: url as NSURL, requiringSecureCoding: true)
        #expect(PlainTextItem.text(from: data) == link)
    }

    @Test func rejectsAnArchiveOfAnotherClass() throws {
        let data = try NSKeyedArchiver.archivedData(withRootObject: NSNumber(value: 1), requiringSecureCoding: true)
        #expect(PlainTextItem.text(from: data) == nil)
    }
}
