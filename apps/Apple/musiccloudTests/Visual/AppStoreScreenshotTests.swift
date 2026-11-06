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
    @Test func captureIPhoneHomeLight() async throws { try await captureIPhoneHome(darkMode: false) }
    @Test func captureIPhoneHomeDark() async throws { try await captureIPhoneHome(darkMode: true) }
    @Test func captureIPhoneSettingsLight() async throws { try await captureIPhoneSettings(darkMode: false) }
    @Test func captureIPhoneSettingsDark() async throws { try await captureIPhoneSettings(darkMode: true) }
    @Test func captureIPadHistoryLight() async throws { try await captureIPadHistory(darkMode: false) }
    @Test func captureIPadHistoryDark() async throws { try await captureIPadHistory(darkMode: true) }
    @Test func captureIPadSettingsLight() async throws { try await captureIPadSettings(darkMode: false) }
    @Test func captureIPadSettingsDark() async throws { try await captureIPadSettings(darkMode: true) }

    private func captureIPhoneHome(darkMode: Bool) async throws {
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
            scale: 3,
            darkMode: darkMode
        )
        try record(png, name: "iphone-home-\(darkMode ? "dark" : "light").png", width: 1320, height: 2868)
    }

    private func captureIPhoneSettings(darkMode: Bool) async throws {
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
            scale: 3,
            darkMode: darkMode
        )
        try record(png, name: "iphone-settings-\(darkMode ? "dark" : "light").png", width: 1320, height: 2868)
    }

    private func captureIPadHistory(darkMode: Bool) async throws {
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
            scale: 2,
            darkMode: darkMode
        )
        try record(png, name: "ipad-history-\(darkMode ? "dark" : "light").png", width: 2064, height: 2752)
    }

    private func captureIPadSettings(darkMode: Bool) async throws {
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
            scale: 2,
            darkMode: darkMode
        )
        try record(png, name: "ipad-settings-\(darkMode ? "dark" : "light").png", width: 2064, height: 2752)
    }
    #else
    @Test func captureMacHistoryLight() async throws { try await captureMacHistory(darkMode: false) }
    @Test func captureMacHistoryDark() async throws { try await captureMacHistory(darkMode: true) }
    @Test func captureMacSettingsLight() async throws { try await captureMacSettings(darkMode: false) }
    @Test func captureMacSettingsDark() async throws { try await captureMacSettings(darkMode: true) }

    private func captureMacHistory(darkMode: Bool) async throws {
        let container = try AppStoreScreenshotFixtures.makeContainer()
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderMac(DashboardView(), container: container, history: history, monitor: monitor, darkMode: darkMode)
        try record(png, name: "mac-history-\(darkMode ? "dark" : "light").png", width: 2880, height: 1800)
    }

    private func captureMacSettings(darkMode: Bool) async throws {
        StreamingServices.setAllEnabled(true)
        let suiteName = "io.musiccloud.musiccloudTests.screenshots"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defaults.set(SettingsPane.streamingServices.rawValue, forKey: DefaultsKey.settingsPane)
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let container = try AppStoreScreenshotFixtures.makeContainer()
        let history = HistoryManager(modelContext: container.mainContext)
        let monitor = ClipboardMonitor(historyManager: history)
        let png = try await renderMac(
            SettingsView().defaultAppStorage(defaults),
            container: container,
            history: history,
            monitor: monitor,
            darkMode: darkMode
        )
        try record(png, name: "mac-settings-\(darkMode ? "dark" : "light").png", width: 2880, height: 1800)
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

    @Test func fixtureCacheIsReusedWithoutRewriting() async throws {
        let container = try AppStoreScreenshotFixtures.makeContainer()
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let directory = AppStoreScreenshotFixtures.cacheDirectory
        let files = (0..<5).map { directory.appendingPathComponent("\($0).json") }
        #expect(files.allSatisfy { FileManager.default.fileExists(atPath: $0.path) })
        let dates = try files.map { try $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate }
        try await AppStoreScreenshotFixtures.populate(in: container.mainContext)
        let unchanged = try files.map { try $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate }
        #expect(dates == unchanged)
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
        scale: CGFloat,
        darkMode: Bool
    ) async throws -> Data {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.backgroundColor = .systemBackground
        let rootView = root.modelContainer(container).environment(history).environment(monitor)
        let controller = UIHostingController(rootView: rootView)
        controller.view.frame = window.bounds
        controller.overrideUserInterfaceStyle = darkMode ? .dark : .light
        window.rootViewController = controller
        #expect(controller.overrideUserInterfaceStyle == (darkMode ? .dark : .light))
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
        monitor: ClipboardMonitor,
        darkMode: Bool
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
        window.appearance = NSAppearance(named: darkMode ? .darkAqua : .aqua)
        #expect(window.appearance?.name == (darkMode ? .darkAqua : .aqua))
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
