//
//  CachedAsyncImage.swift
//  musiccloud
//
//  Created by Frank Gregor on 08.04.26.
//

import ImageIO
import SwiftUI

// MARK: - CachedAsyncImage

/// The artwork of a history entry, decoded at the size it is shown.
///
/// The artwork stored with the entry is used first, so a row works offline
/// and costs no second download. Only an entry without stored artwork
/// fetches it from its URL.
///
/// Either way the image is decoded off the main thread into a thumbnail
/// no larger than the view measures, because a full-size cover decodes to
/// several megabytes and the grid shows dozens of them. Thumbnails are
/// cached per entry and size, limited by their decoded size in bytes.
struct CachedAsyncImage<Placeholder: View>: View {
    let entry: MediaEntry
    @ViewBuilder let placeholder: () -> Placeholder

    @Environment(\.displayScale) private var displayScale
    @State private var image: CGImage?
    /// The longest edge of the view, in points. Zero until the first layout.
    @State private var pointSize: CGFloat = 0

    var body: some View {
        Group {
            if let image {
                Image(decorative: image, scale: displayScale)
                    .resizable()
                    .scaledToFill()
            } else {
                placeholder()
            }
        }
        .onGeometryChange(for: CGFloat.self) { proxy in
            max(proxy.size.width, proxy.size.height)
        } action: { newValue in
            pointSize = newValue
        }
        .task(id: cacheKey) {
            guard pixelSize > 0 else { return }
            image = await loadImage()
        }
    }
}

// MARK: - Loading

private extension CachedAsyncImage {
    /// The longest edge in pixels, rounded up to steps of 64 so a few
    /// points of layout change do not decode the same artwork again.
    var pixelSize: Int {
        let pixels = Int((pointSize * displayScale).rounded(.up))
        return ((pixels + 63) / 64) * 64
    }

    var cacheKey: String { "\(entry.id.uuidString)@\(pixelSize)" }

    func loadImage() async -> CGImage? {
        let key = cacheKey
        if let cached = ArtworkThumbnailCache.shared.image(forKey: key) { return cached }

        var data = entry.artworkImageData
        if data == nil, let artworkUrl = entry.contentType.artworkUrl {
            data = await MusicCloudAPI.downloadArtwork(from: artworkUrl)
        }
        guard let data, !Task.isCancelled else { return nil }

        guard let thumbnail = await ArtworkThumbnailCache.thumbnail(from: data, maxPixelSize: pixelSize) else { return nil }
        ArtworkThumbnailCache.shared.store(thumbnail, forKey: key)
        return thumbnail
    }
}

// MARK: - ArtworkThumbnailCache

/// Decoded artwork thumbnails, shared by every artwork view.
///
/// `NSCache` is thread-safe and drops entries under memory pressure. The
/// cost of an entry is its decoded size, so the limit is a memory budget
/// rather than a count.
final class ArtworkThumbnailCache: @unchecked Sendable {
    static let shared = ArtworkThumbnailCache()

    /// The memory the cached thumbnails may take, in bytes.
    private static let memoryBudgetBytes = 48 * 1024 * 1024

    private let cache: NSCache<NSString, CGImage> = {
        let cache = NSCache<NSString, CGImage>()
        cache.totalCostLimit = memoryBudgetBytes
        return cache
    }()

    func image(forKey key: String) -> CGImage? {
        cache.object(forKey: key as NSString)
    }

    func store(_ image: CGImage, forKey key: String) {
        cache.setObject(image, forKey: key as NSString, cost: image.bytesPerRow * image.height)
    }

    /// Decodes image data into a thumbnail whose longest edge is at most `maxPixelSize`.
    ///
    /// ImageIO decodes straight to the target size, so the full-size bitmap
    /// never exists in memory. This is `nonisolated` and `async`, so it runs
    /// on the cooperative pool rather than on the main actor.
    ///
    /// - Parameters:
    ///   - data: Encoded image data, such as JPEG or PNG.
    ///   - maxPixelSize: The longest edge of the result, in pixels.
    /// - Returns: The decoded thumbnail, or `nil` when the data is not an image.
    nonisolated static func thumbnail(from data: Data, maxPixelSize: Int) async -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}
