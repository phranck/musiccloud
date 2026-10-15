import Foundation
import Testing
@testable import musiccloud

// MARK: - ArtistHashtagTests

struct ArtistHashtagTests {
    @Test(arguments: [
        ("Pat Metheny", "#PatMetheny"),
        ("Guns N' Roses", "#GunsNRoses"),
        ("AC/DC", "#ACDC"),
        ("Sigur Rós", "#SigurRós"),
        ("deadmau5", "#Deadmau5"),
        ("Simon & Garfunkel", "#SimonGarfunkel"),
        ("the_band", "#The_band"),
    ])
    func nameBecomesALinkableHashtag(name: String, hashtag: String) {
        #expect(PostVariable.hashtag(for: name) == hashtag)
    }

    /// Mastodon links no tag without a letter, so such a name gives none.
    @Test(arguments: ["", "  ", "1999", "!!!"])
    func nameWithoutALetterGivesNoHashtag(name: String) {
        #expect(PostVariable.hashtag(for: name) == nil)
    }

    @Test func everyArtistOfATrackGetsItsOwnHashtag() {
        let context = PostContext(
            track: TrackInfo(title: "Song", artists: ["Pat Metheny", "Lyle Mays", "1999"], albumName: nil, durationMs: nil, releaseDate: nil),
            album: nil, artist: nil, shareURL: "", originalURL: "", serviceLinks: [])
        #expect(PostTemplateRenderer.render("{artist_hashtag}", with: context) == "#PatMetheny #LyleMays")
    }
}
