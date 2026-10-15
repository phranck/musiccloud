#if os(macOS)
//
//  MarkdownTemplateEditor.swift
//  musiccloud
//

import AppKit
import SwiftUI

// MARK: - MarkdownTemplateEditor

/// The template text editor: Markdown with line numbers in a gutter,
/// syntax coloring, and completion for variables.
///
/// SwiftUI's `TextEditor` offers neither a gutter nor coloring nor
/// completion, so this wraps an `NSTextView`. It uses TextKit 1, because
/// the gutter reads line positions from its `NSLayoutManager`. Typing `{`
/// opens the system completion list; accepting an entry puts in the whole
/// `{name}`. Colors are system colors, so light and dark mode follow.
struct MarkdownTemplateEditor: NSViewRepresentable {
    @Binding var text: String
    /// Whether the text can be changed; a system template is read-only.
    var isEditable: Bool = true
    /// Every placeholder offered for completion, such as `{song_name}`.
    var tokens: [String]

    func makeNSView(context: Context) -> NSScrollView {
        let textView = TemplateTextView(usingTextLayoutManager: false)
        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.allowsUndo = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isContinuousSpellCheckingEnabled = false
        textView.font = Self.baseFont
        textView.textColor = .labelColor
        textView.drawsBackground = false
        textView.textContainerInset = NSSize(width: 4, height: 8)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        textView.string = text

        let scrollView = NSScrollView()
        scrollView.documentView = textView
        scrollView.hasVerticalScroller = true
        scrollView.drawsBackground = false
        scrollView.verticalRulerView = LineNumberRulerView(textView: textView)
        scrollView.hasVerticalRuler = true
        scrollView.rulersVisible = true

        context.coordinator.textView = textView
        context.coordinator.highlight()
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        context.coordinator.parent = self
        guard let textView = context.coordinator.textView else { return }
        textView.isEditable = isEditable
        textView.isSelectable = true
        if textView.string != text {
            textView.string = text
            context.coordinator.highlight()
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    /// The editor's font: the system monospaced font at the body size.
    static let baseFont = NSFont.monospacedSystemFont(ofSize: NSFont.systemFontSize, weight: .regular)

    // MARK: Coordinator

    /// Keeps the binding and the coloring in step with the text view, and
    /// answers its completion requests.
    @MainActor
    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: MarkdownTemplateEditor
        weak var textView: NSTextView?

        init(parent: MarkdownTemplateEditor) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard let textView else { return }
            parent.text = textView.string
            highlight()
            textView.enclosingScrollView?.verticalRulerView?.needsDisplay = true
        }

        func textView(
            _ textView: NSTextView,
            completions words: [String],
            forPartialWordRange charRange: NSRange,
            indexOfSelectedItem index: UnsafeMutablePointer<Int>?
        ) -> [String] {
            let partial = (textView.string as NSString).substring(with: charRange)
            guard partial.hasPrefix("{") else { return [] }
            index?.pointee = 0
            return TemplateCompletion.candidates(for: partial, from: parent.tokens)
        }

        /// Colors the whole text again. Templates are short, so a full pass
        /// on every change costs less than tracking edited ranges.
        func highlight() {
            guard let storage = textView?.textStorage else { return }
            let whole = NSRange(location: 0, length: storage.length)
            let known = Set(parent.tokens)

            storage.beginEditing()
            storage.setAttributes([.font: MarkdownTemplateEditor.baseFont, .foregroundColor: NSColor.labelColor], range: whole)
            let highlights = TemplateSyntaxHighlighter.highlights(in: storage.string) { known.contains("{\($0)}") }
            for highlight in highlights {
                storage.addAttributes(Self.attributes(for: highlight.kind), range: highlight.range)
            }
            storage.endEditing()
        }

        private static func attributes(for kind: TemplateSyntaxHighlighter.Kind) -> [NSAttributedString.Key: Any] {
            let fonts = NSFontManager.shared
            let base = MarkdownTemplateEditor.baseFont
            switch kind {
            case .variable:
                return [.foregroundColor: TemplateSyntaxColors.variable]
            case .unknownVariable:
                return [.foregroundColor: TemplateSyntaxColors.unknownVariable, .underlineStyle: NSUnderlineStyle.single.rawValue]
            case .heading, .bold:
                return [.font: fonts.convert(base, toHaveTrait: .boldFontMask)]
            case .italic:
                return [.font: fonts.convert(base, toHaveTrait: .italicFontMask)]
            case .code:
                return [.foregroundColor: TemplateSyntaxColors.code]
            case .quote:
                return [.foregroundColor: TemplateSyntaxColors.quote]
            case .link:
                return [.foregroundColor: TemplateSyntaxColors.link]
            case .hashtag:
                return [.foregroundColor: TemplateSyntaxColors.hashtag]
            }
        }
    }
}

// MARK: - TemplateTextView

/// A text view that completes `{variables}` while they are typed and
/// highlights the line the cursor stands in.
///
/// AppKit completes words, and `{` is no word character, so the range to
/// complete is computed here. AppKit also closes its completion list on the
/// next keystroke, so the list is opened again after every character typed
/// or deleted inside an unfinished placeholder, filtered by what is there.
final class TemplateTextView: NSTextView {
    /// The fill behind the current line. A translucent label color stays
    /// faint on both the light and the dark background.
    private static let currentLineColor = NSColor.labelColor.withAlphaComponent(0.06)

    /// Every cursor move redraws, so the highlight follows the cursor.
    override func setSelectedRanges(_ ranges: [NSValue], affinity: NSSelectionAffinity, stillSelecting: Bool) {
        super.setSelectedRanges(ranges, affinity: affinity, stillSelecting: stillSelecting)
        needsDisplay = true
    }

    override func drawBackground(in rect: NSRect) {
        super.drawBackground(in: rect)
        guard let lineRect = currentLineRect, lineRect.intersects(rect) else { return }
        Self.currentLineColor.setFill()
        lineRect.fill()
    }

    /// The current line across the full width, or `nil` while text is
    /// selected or the template is read-only.
    ///
    /// A line is a paragraph, which is what `LineNumberRulerView` numbers,
    /// so a wrapped paragraph is highlighted as a whole. After a final line
    /// break the cursor stands on the extra line fragment, which holds no
    /// character.
    private var currentLineRect: NSRect? {
        let selection = selectedRange()
        guard isEditable, selection.length == 0, let layoutManager, let textContainer else { return nil }
        let text = string as NSString
        let fragment: NSRect
        if selection.location == text.length, text.length == 0 || text.character(at: text.length - 1) == 0x0A {
            layoutManager.ensureLayout(for: textContainer)
            fragment = layoutManager.extraLineFragmentRect
        } else {
            let paragraph = text.paragraphRange(for: selection)
            let glyphs = layoutManager.glyphRange(forCharacterRange: paragraph, actualCharacterRange: nil)
            guard glyphs.length > 0 else { return nil }
            fragment = layoutManager.lineFragmentRect(forGlyphAt: glyphs.location, effectiveRange: nil)
                .union(layoutManager.lineFragmentRect(forGlyphAt: NSMaxRange(glyphs) - 1, effectiveRange: nil))
        }
        guard fragment.height > 0 else { return nil }
        return NSRect(x: bounds.minX, y: fragment.minY + textContainerOrigin.y, width: bounds.width, height: fragment.height)
    }

    /// ⌘B, ⌘I, ⌘E, ⌘K and ⌘' format the selection; see ``MarkdownShortcut``.
    ///
    /// The menu bar app has no Format menu that would send these, so the
    /// text view answers them itself. Shift is allowed for a key that is no
    /// letter, because `'` needs it on layouts such as German, while ⌘⇧B
    /// stays free. ⌘K takes a URL from the clipboard. The change goes through
    /// `insertText`, so ⌘Z undoes it and the coloring follows.
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard isEditable, window?.firstResponder === self,
              let key = event.charactersIgnoringModifiers,
              modifiers == .command || (modifiers == [.command, .shift] && !key.contains(where: \.isLetter)),
              let shortcut = MarkdownShortcut(commandKey: key)
        else { return super.performKeyEquivalent(with: event) }

        let edit = shortcut.edit(in: string, selection: selectedRange(), clipboard: Pasteboard.string)
        insertText(edit.replacement, replacementRange: edit.range)
        setSelectedRange(edit.selection)
        return true
    }

    override var rangeForUserCompletion: NSRange {
        TemplateCompletion.partialRange(in: string, cursor: selectedRange().location) ?? super.rangeForUserCompletion
    }

    override func insertText(_ string: Any, replacementRange: NSRange) {
        super.insertText(string, replacementRange: replacementRange)
        completeIfInsidePlaceholder()
    }

    override func deleteBackward(_ sender: Any?) {
        super.deleteBackward(sender)
        completeIfInsidePlaceholder()
    }

    /// Opens the completion list when the cursor stands in an unfinished
    /// `{name`, on a later turn of the main actor, so the keystroke has
    /// reached the text first.
    private func completeIfInsidePlaceholder() {
        Task { @MainActor [weak self] in
            guard let self, selectedRange().length == 0,
                  TemplateCompletion.partialRange(in: string, cursor: selectedRange().location) != nil
            else { return }
            complete(nil)
        }
    }
}

#endif
