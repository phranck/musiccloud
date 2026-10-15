#if os(macOS)
//
//  LineNumberRulerView.swift
//  musiccloud
//

import AppKit

// MARK: - LineNumberRulerView

/// The gutter beside the template editor, numbering every line of text.
///
/// Numbers count the lines the user typed, not the lines wrapping makes, so
/// a long wrapped paragraph keeps one number at its first line. Only the
/// lines inside the visible rect are drawn, so long templates stay cheap.
final class LineNumberRulerView: NSRulerView {
    private weak var textView: NSTextView?

    private let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.monospacedDigitSystemFont(ofSize: NSFont.smallSystemFontSize, weight: .regular),
        .foregroundColor: NSColor.tertiaryLabelColor,
    ]

    /// Creates the gutter for `textView` inside its scroll view.
    init(textView: NSTextView) {
        self.textView = textView
        super.init(scrollView: textView.enclosingScrollView, orientation: .verticalRuler)
        clientView = textView
        ruleThickness = 36
    }

    @available(*, unavailable)
    required init(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func drawHashMarksAndLabels(in rect: NSRect) {
        guard let textView,
              let layoutManager = textView.layoutManager,
              let textContainer = textView.textContainer else { return }

        NSColor.textBackgroundColor.setFill()
        bounds.fill()

        // The fill covers the ruler's own border, which then showed only below
        // the text, so the separator is drawn here along the whole height.
        NSColor.separatorColor.setFill()
        NSRect(x: bounds.maxX - 1, y: bounds.minY, width: 1, height: bounds.height).fill()

        let text = textView.string as NSString
        let glyphRange = layoutManager.glyphRange(forBoundingRect: textView.visibleRect, in: textContainer)
        let visible = layoutManager.characterRange(forGlyphRange: glyphRange, actualGlyphRange: nil)

        // The number of the first visible line is one more than the line breaks before it.
        var lineNumber = 1
        text.enumerateSubstrings(in: NSRange(location: 0, length: visible.location), options: [.byLines, .substringNotRequired]) { _, _, _, _ in
            lineNumber += 1
        }

        var index = visible.location
        while index < text.length, index <= NSMaxRange(visible) {
            let lineRange = text.lineRange(for: NSRange(location: index, length: 0))
            let glyph = layoutManager.glyphIndexForCharacter(at: lineRange.location)
            draw(lineNumber, at: layoutManager.lineFragmentRect(forGlyphAt: glyph, effectiveRange: nil), in: textView)
            lineNumber += 1
            index = NSMaxRange(lineRange)
        }

        // An empty text, or one ending in a line break, has an empty last line to number.
        if index >= text.length, text.length == 0 || text.hasSuffix("\n") {
            draw(lineNumber, at: layoutManager.extraLineFragmentRect, in: textView)
        }
    }

    /// Draws `number` right-aligned, vertically centered on `lineRect`.
    private func draw(_ number: Int, at lineRect: NSRect, in textView: NSTextView) {
        let origin = convert(NSPoint(x: 0, y: lineRect.minY + textView.textContainerInset.height), from: textView)
        let label = "\(number)" as NSString
        let size = label.size(withAttributes: attributes)
        label.draw(
            at: NSPoint(x: ruleThickness - size.width - 6, y: origin.y + (lineRect.height - size.height) / 2),
            withAttributes: attributes
        )
    }
}

#endif
