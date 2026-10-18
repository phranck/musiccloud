#if os(macOS)
import AppKit
import SwiftUI

/// Gives the native Settings split view a stable AppKit divider-autosave identity.
struct SettingsSidebarPersistence: NSViewRepresentable {
    let autosaveName: String

    /// Creates an invisible attachment; AppKit performs divider storage and restoration.
    func makeNSView(context: Context) -> SettingsSidebarAutosaveView { SettingsSidebarAutosaveView(autosaveName: autosaveName) }

    /// The identity is stable for the lifetime of the Settings view.
    func updateNSView(_ nsView: SettingsSidebarAutosaveView, context: Context) {}
}

/// Attaches persistence after SwiftUI installs the sidebar in its native split-view hierarchy.
final class SettingsSidebarAutosaveView: NSView {
    let autosaveName: String

    /// Creates a non-interactive observer for one stable divider configuration.
    /// - Parameter autosaveName: AppKit's preference identity, unique in tests.
    init(autosaveName: String) {
        self.autosaveName = autosaveName
        super.init(frame: .zero)
    }

    /// This programmatic observer is never decoded from an archive.
    required init?(coder: NSCoder) { nil }

    override func viewDidMoveToSuperview() {
        super.viewDidMoveToSuperview()
        configurePersistence()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        configurePersistence()
    }

    override func layout() {
        super.layout()
        configurePersistence()
    }

    /// Leaves mouse input to the sidebar and divider instead of the invisible attachment.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

private extension SettingsSidebarAutosaveView {
    /// Finds only this sidebar's ancestor split view and leaves its delegate and sizing rules intact.
    func configurePersistence() {
        var ancestor = superview
        while let view = ancestor {
            if let splitView = view as? NSSplitView {
                if splitView.autosaveName != autosaveName { splitView.autosaveName = autosaveName }
                return
            }
            ancestor = view.superview
        }
    }
}
#endif
