import Foundation
import ImageIO
import SwiftData
@testable import musiccloud

enum AppStoreScreenshotFixtures {
    private static let sourceURLs = [
        "https://open.spotify.com/intl-de/track/2r4hIJJQ8GiRjztiJskfdF?si=bba310702b1e4b7a",
        "https://open.spotify.com/intl-de/track/4S1VYqwfkLit9mKVY3MXoo?si=5c4b2c75a5c3482d",
        "https://open.spotify.com/intl-de/track/76Kue8CxsgmLL0WBlsGDhG?si=3d06199ce4104f0c",
        "https://open.spotify.com/intl-de/track/1ROBixGgXrYlcCcrBfxAoy?si=f892c1798c524d69",
        "https://open.spotify.com/intl-de/track/2Wn8X6fqkNihu33aV9YesP?si=73aca950390c49cf",
    ]

    static func makeContainer() throws -> ModelContainer {
        try ModelContainer(for: MediaEntry.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true, cloudKitDatabase: .none))
    }

    static func populate(in context: ModelContext) async throws {
        var entries: [MediaEntry] = []
        for sourceURL in sourceURLs {
            let conversion = try await MusicCloudAPI.convert(url: sourceURL)
            let entry = conversion.makeEntry(originalUrl: sourceURL)
            context.insert(entry)
            entries.append(entry)
        }
        try context.save()
        for entry in entries {
            let data = try require(entry.artworkImageData)
            let source = try require(CGImageSourceCreateWithData(data as CFData, nil))
            for pixelSize in [256, 320, 384, 576, 640] {
                let options: [CFString: Any] = [
                    kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceShouldCacheImmediately: true, kCGImageSourceThumbnailMaxPixelSize: pixelSize,
                ]
                let thumbnail = try require(CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary))
                ArtworkThumbnailCache.shared.store(thumbnail, forKey: "\(entry.id.uuidString)@\(pixelSize)")
            }
        }
    }

    private static func require<T>(_ value: T?) throws -> T {
        guard let value
        else {
            throw FixtureError.missingArtwork
        }
        return value
    }
}

private enum FixtureError: Error { case missingArtwork }
