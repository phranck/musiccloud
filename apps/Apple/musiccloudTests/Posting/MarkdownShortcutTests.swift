import Foundation
import Testing
@testable import musiccloud

// MARK: - MarkdownShortcutTests

struct MarkdownShortcutTests {
    /// The text after applying `edit`, and what is selected then.
    private func apply(_ edit: MarkdownShortcut.Edit, to text: String) -> (String, String) {
        let result = (text as NSString).replacingCharacters(in: edit.range, with: edit.replacement)
        return (result, (result as NSString).substring(with: edit.selection))
    }

    @Test func boldWrapsTheSelectionAndKeepsItSelected() {
        let text = "Now playing MoonDial"
        let (result, selected) = apply(MarkdownShortcut.bold.edit(in: text, selection: NSRange(location: 12, length: 8)), to: text)
        #expect(result == "Now playing **MoonDial**")
        #expect(selected == "MoonDial")
    }

    @Test(arguments: [NSRange(location: 2, length: 8), NSRange(location: 0, length: 12)])
    func boldAgainRemovesTheMarkersInsideOrOutsideTheSelection(selection: NSRange) {
        let text = "**MoonDial**"
        let (result, selected) = apply(MarkdownShortcut.bold.edit(in: text, selection: selection), to: text)
        #expect(result == "MoonDial")
        #expect(selected == "MoonDial")
    }

    /// Italic on bold text adds italic rather than taking a star from bold.
    @Test func italicLeavesBoldAlone() {
        let text = "**MoonDial**"
        let (result, _) = apply(MarkdownShortcut.italic.edit(in: text, selection: NSRange(location: 2, length: 8)), to: text)
        #expect(result == "***MoonDial***")
    }

    @Test func withoutSelectionTheCursorStandsBetweenTheMarkers() {
        let edit = MarkdownShortcut.code.edit(in: "ab", selection: NSRange(location: 1, length: 0))
        let (result, _) = apply(edit, to: "ab")
        #expect(result == "a``b")
        #expect(edit.selection == NSRange(location: 2, length: 0))
    }

    @Test func linkSelectsTheURLStillToBeTyped() {
        let text = "Listen"
        let (result, selected) = apply(MarkdownShortcut.link.edit(in: text, selection: NSRange(location: 0, length: 6)), to: text)
        #expect(result == "[Listen](url)")
        #expect(selected == "url")
    }

    @Test func linkWithoutSelectionPutsTheCursorIntoTheBrackets() {
        let edit = MarkdownShortcut.link.edit(in: "", selection: NSRange(location: 0, length: 0))
        #expect(edit.replacement == "[](url)")
        #expect(edit.selection == NSRange(location: 1, length: 0))
    }

    /// Ranges count UTF-16, as the text view does, so text after an emoji is still hit.
    @Test func rangesCountUTF16() {
        let text = "🎵 Song"
        let (result, selected) = apply(MarkdownShortcut.italic.edit(in: text, selection: NSRange(location: 3, length: 4)), to: text)
        #expect(result == "🎵 *Song*")
        #expect(selected == "Song")
    }

    @Test func commandKeysMapToTheirShortcuts() {
        #expect(MarkdownShortcut(commandKey: "b") == .bold)
        #expect(MarkdownShortcut(commandKey: "I") == .italic)
        #expect(MarkdownShortcut(commandKey: "e") == .code)
        #expect(MarkdownShortcut(commandKey: "k") == .link)
        #expect(MarkdownShortcut(commandKey: "x") == nil)
    }
}
