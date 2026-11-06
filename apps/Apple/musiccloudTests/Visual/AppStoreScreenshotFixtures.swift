import Foundation
import ImageIO
import SwiftData
@testable import musiccloud

enum AppStoreScreenshotFixtures {
    static let cacheDirectory = Bundle.allBundles.first(where: { $0.bundlePath.hasSuffix(".xctest") })!.resourceURL!

    static func makeContainer() throws -> ModelContainer {
        try ModelContainer(for: MediaEntry.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true, cloudKitDatabase: .none))
    }

    static func populate(in context: ModelContext) async throws {
        let sourcesData = try Data(contentsOf: cacheDirectory.appendingPathComponent("sources.json"))
        let sourceURLs = try JSONDecoder().decode([String].self, from: sourcesData)
        var entries: [MediaEntry] = []
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for index in sourceURLs.indices {
            let file = cacheDirectory.appendingPathComponent("\(index).json")
            let entry = try decoder.decode(CachedEntry.self, from: Data(contentsOf: file)).makeEntry()
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

private struct CachedEntry: Codable {
    let originalUrl: String
    let shortUrl: String
    let mediaType: MediaType
    let artworkImageData: Data?
    let date: Date
    let track: TrackInfo?
    let album: AlbumInfo?
    let artist: ArtistInfo?
    let serviceLinks: [ServiceLink]

    func makeEntry() -> MediaEntry {
        MediaEntry(
            originalUrl: originalUrl,
            shortUrl: shortUrl,
            mediaType: mediaType,
            artworkImageData: artworkImageData,
            date: date,
            track: track,
            album: album,
            artist: artist,
            serviceLinks: serviceLinks
        )
    }
}

private enum FixtureError: Error { case missingArtwork }
