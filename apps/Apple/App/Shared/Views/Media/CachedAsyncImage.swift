//
//  CachedAsyncImage.swift
//  musiccloud
//
//  Created by Frank Gregor on 08.04.26.
//

import SwiftUI

// MARK: - CachedAsyncImage

/// An async image view backed by an in-memory cache.
///
/// Uses a shared `NSCache` to avoid re-downloading images during scrolling
/// in `LazyVGrid` layouts where `AsyncImage` would reload on every reuse.
struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: Image?

    var body: some View {
        Group {
            if let image {
                image.resizable().scaledToFill()
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            guard let url else { return }
            image = await Self.loadImage(from: url)
        }
    }
}

// MARK: - Private API

private extension CachedAsyncImage {
    static var cache: NSCache<NSURL, PlatformImage> {
        ImageCacheHolder.shared
    }

    static func loadImage(from url: URL) async -> Image? {
        let nsURL = url as NSURL
        if let cached = cache.object(forKey: nsURL) {
            #if os(macOS)
            return Image(nsImage: cached)
            #else
            return Image(uiImage: cached)
            #endif
        }

        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let platformImage = PlatformImage(data: data) else { return nil }
            cache.setObject(platformImage, forKey: nsURL)
            #if os(macOS)
            return Image(nsImage: platformImage)
            #else
            return Image(uiImage: platformImage)
            #endif
        } catch {
            return nil
        }
    }
}

// MARK: - Platform Image

#if os(macOS)
import AppKit
private typealias PlatformImage = NSImage
#else
import UIKit
private typealias PlatformImage = UIImage
#endif

// MARK: - Cache Holder

private final class ImageCacheHolder: @unchecked Sendable {
    static let shared: NSCache<NSURL, PlatformImage> = {
        let cache = NSCache<NSURL, PlatformImage>()
        cache.countLimit = 200
        return cache
    }()
}
