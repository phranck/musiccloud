import Foundation
import ImageIO
import SwiftData
import SwiftUI
import Testing
import UniformTypeIdentifiers
@testable import musiccloud

#if os(iOS)
import UIKit
#else
import AppKit
#endif

@MainActor @Suite(.serialized) struct AppStoreScreenshotTests {
    #if os(iOS)
    @Test func captureIPhoneHome() async throws {
        let container = try AppStoreScreenshotFixtures.makeContainer()
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderIOS(
            NavigationStack { HomeView() },
            container: container,
            history: history,
            monitor: monitor,
            size: CGSize(width: 440, height: 956),
            scale: 3
        )
        try record(png, name: "iphone-home.png", width: 1320, height: 2868)
    }

    @Test func captureIPhoneSettings() async throws {
        StreamingServices.setAllEnabled(true)
        let container = try AppStoreScreenshotFixtures.makeContainer()
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderIOS(
            NavigationStack { StreamingServicesSettingsView() },
            container: container,
            history: history,
            monitor: monitor,
            size: CGSize(width: 440, height: 956),
            scale: 3
        )
        try record(png, name: "iphone-settings.png", width: 1320, height: 2868)
    }

    @Test func captureIPadHistory() async throws {
        let container = try AppStoreScreenshotFixtures.makeContainer()
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderIOS(
            NavigationStack { HistoryView() },
            container: container,
            history: history,
            monitor: monitor,
            size: CGSize(width: 1032, height: 1376),
            scale: 2
        )
        try record(png, name: "ipad-history.png", width: 2064, height: 2752)
    }

    @Test func captureIPadSettings() async throws {
        StreamingServices.setAllEnabled(true)
        let container = try AppStoreScreenshotFixtures.makeContainer()
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderIOS(
            NavigationStack { StreamingServicesSettingsView() },
            container: container,
            history: history,
            monitor: monitor,
            size: CGSize(width: 1032, height: 1376),
            scale: 2
        )
        try record(png, name: "ipad-settings.png", width: 2064, height: 2752)
    }
    #else
    @Test func captureMacHistory() async throws {
        let container = try AppStoreScreenshotFixtures.makeContainer()
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderMac(DashboardView(), container: container, history: history, monitor: monitor)
        try record(png, name: "mac-history.png", width: 2880, height: 1800)
    }

    @Test func captureMacSettings() async throws {
        StreamingServices.setAllEnabled(true)
        let suiteName = "io.musiccloud.musiccloudTests.screenshots"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defaults.set(SettingsPane.streamingServices.rawValue, forKey: DefaultsKey.settingsPane)
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let container = try AppStoreScreenshotFixtures.makeContainer()
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderMac(SettingsView().defaultAppStorage(defaults), container: container, history: history, monitor: monitor)
        try record(png, name: "mac-settings.png", width: 2880, height: 1800)
    }
    #endif

    @Test func fixtureEntriesUseRealCoverArtwork() async throws {
        let container = try AppStoreScreenshotFixtures.makeContainer()
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let entries = try container.mainContext.fetch(FetchDescriptor<MediaEntry>())
        #expect(entries.count == 5)
        for entry in entries { #expect(entry.artworkImageData?.isEmpty == false) }
    }

    @Test func fixtureArtworkIsCachedForCapture() async throws {
        let container = try AppStoreScreenshotFixtures.makeContainer()
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let entries = try container.mainContext.fetch(FetchDescriptor<MediaEntry>())
        #expect(entries.count == 5)
        for entry in entries {
            let key = "\(entry.id.uuidString)@576"
            #expect(ArtworkThumbnailCache.shared.image(forKey: key) != nil)
        }
    }
}

#if os(iOS)
private extension AppStoreScreenshotTests {
    func renderIOS<Content: View>(
        _ root: Content,
        container: ModelContainer,
        history: HistoryManager,
        monitor: ClipboardMonitor,
        size: CGSize,
        scale: CGFloat
    ) async throws -> Data {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.backgroundColor = .systemBackground
        let rootView = root.modelContainer(container).environment(history).environment(monitor)
        let controller = UIHostingController(rootView: rootView)
        controller.view.frame = window.bounds
        window.rootViewController = controller
        window.makeKeyAndVisible()
        await Task.yield()
        controller.view.layoutIfNeeded()
        window.layoutIfNeeded()
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = scale
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds, format: format)
        let png = renderer.pngData { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        window.isHidden = true
        return png
    }
}
#else
private extension AppStoreScreenshotTests {
    func renderMac<Content: View>(
        _ root: Content,
        container: ModelContainer,
        history: HistoryManager,
        monitor: ClipboardMonitor
    ) async throws -> Data {
        let rootView = root.modelContainer(container).environment(history).environment(monitor)
        let controller = NSHostingController(rootView: rootView)
        controller.sceneBridgingOptions = [.toolbars, .title]
        controller.sizingOptions = []
        let frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        let window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.contentViewController = controller
        window.setContentSize(frame.size)
        window.makeKeyAndOrderFront(nil)
        await Task.yield()
        window.displayIfNeeded()
        controller.view.layoutSubtreeIfNeeded()
        let representation = try #require(controller.view.bitmapImageRepForCachingDisplay(in: controller.view.bounds))
        controller.view.cacheDisplay(in: controller.view.bounds, to: representation)
        let png = try #require(representation.representation(using: .png, properties: [:]))
        window.orderOut(nil)
        return png
    }
}
#endif

private extension AppStoreScreenshotTests {
    func record(_ data: Data, name: String, width: Int, height: Int) throws {
        let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
        #expect(CGImageSourceGetType(source) == UTType.png.identifier as CFString)
        let image = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
        #expect(image.width == width)
        #expect(image.height == height)
        Attachment.record(Attachment(data, named: name))
    }
}
