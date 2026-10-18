#if os(macOS)
import AppKit
import Testing
@testable import musiccloud

/// Uses offscreen native views and unique autosave names, never the user's Settings state.
@MainActor struct SettingsSidebarPersistenceTests {
    /// An attached sidebar observer must configure the enclosing native divider.
    @Test func attachesAutosaveToTheEnclosingSplitView() {
        let name = "musiccloud.tests.sidebar.\(UUID().uuidString)"
        defer { removePreferences(named: name) }
        let split = makeSplitView()
        let observer = SettingsSidebarAutosaveView(autosaveName: name)
        split.subviews[0].addSubview(observer)
        observer.layoutSubtreeIfNeeded()
        #expect(split.autosaveName == name)
    }

    /// AppKit must restore a changed divider when a new view uses the same identity.
    @Test func dividerWidthSurvivesRecreatingTheWindow() {
        let name = "musiccloud.tests.sidebar.\(UUID().uuidString)"
        defer { removePreferences(named: name) }
        let first = makeSplitView()
        first.autosaveName = name
        let window = NSWindow(contentRect: first.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = first
        first.adjustSubviews()
        first.setPosition(226, ofDividerAt: 0)
        RunLoop.current.run(until: Date().addingTimeInterval(0.03))
        let savedWidth = first.subviews[0].frame.width
        #expect(abs(savedWidth - 226) < 1)
        let restored = makeSplitView()
        restored.autosaveName = name
        let reopened = NSWindow(contentRect: restored.frame, styleMask: [.titled], backing: .buffered, defer: false)
        reopened.contentView = restored
        restored.adjustSubviews()
        #expect(abs(restored.subviews[0].frame.width - savedWidth) < 1)
        window.contentView = nil
        reopened.contentView = nil
    }
}

private extension SettingsSidebarPersistenceTests {
    /// Creates a two-column split view without displaying or activating any window.
    func makeSplitView() -> NSSplitView {
        let split = NSSplitView(frame: NSRect(x: 0, y: 0, width: 600, height: 520))
        split.isVertical = true
        split.dividerStyle = .thin
        split.addSubview(NSView(frame: NSRect(x: 0, y: 0, width: 200, height: 520)))
        split.addSubview(NSView(frame: NSRect(x: 201, y: 0, width: 399, height: 520)))
        return split
    }

    /// Removes only preference entries containing this test's unique autosave identity.
    func removePreferences(named name: String) {
        for key in UserDefaults.standard.dictionaryRepresentation().keys where key.contains(name) {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
}
#endif
