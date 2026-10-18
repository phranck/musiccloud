#if os(iOS)
import SwiftUI

// MARK: - ConversionPhase

/// How far a conversion has come, as the conversion sheet shows it.
///
/// The iOS app derives it from ``ClipboardMonitor/status``, the Share
/// Extension from its own conversion, so both show the same sheet.
enum ConversionPhase {
    /// The URL is converting.
    case converting
    /// The URL is converted and its entry is in the history.
    case finished(MediaEntry)
    /// The conversion failed; `message` says why, or is `nil` when there is nothing to add to the title.
    case failed(message: String?)
}

// MARK: - ConversionSheet

/// The sheet for one conversion, in the iOS app and in the Share Extension:
/// the animation while the URL converts, ``ShareResultView`` once it is
/// converted, and the error when it fails. Every state has the
/// ``SheetHeader`` with the close button at the top.
///
/// It is the root of its own hosting in both places, so it sets the
/// hierarchical rendering for its symbols itself.
struct ConversionSheet: View {
    let phase: ConversionPhase
    /// Closes the sheet.
    let onClose: () -> Void

    var body: some View { content.symbolRenderingMode(.hierarchical) }

    @ViewBuilder private var content: some View {
        switch phase {
        case .converting: ConversionProgressView(onClose: onClose)
        case .finished(let entry):
            ShareResultView(entry: entry, accounts: SocialAccount.all(in: SocialConnections.shared.store), onDone: onClose)
                // The result keeps its post state per entry, so a later conversion starts a fresh one.
                .id(entry.id)
        case .failed(let message): ConversionErrorView(message: message, onClose: onClose)
        }
    }
}

// MARK: - ConversionProgressView

/// The animated rainbow wordmark with a bouncing equalizer below it, shown
/// while the URL converts.
private struct ConversionProgressView: View {
    /// Closes the sheet.
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            OutlinedLogoText(size: 44, isAnimating: true)
            EqualizerBars()
        }.frame(maxWidth: .infinity, maxHeight: .infinity).accessibilityElement(children: .ignore).accessibilityLabel(
            String(localized: "Converting URL")
        ).sheetHeader(onClose: onClose)
    }
}

// MARK: - ConversionErrorView

/// Why the conversion failed, below the header with the close button.
private struct ConversionErrorView: View {
    /// What went wrong, or `nil` when there is nothing to add to the title.
    let message: String?
    /// Closes the sheet.
    let onClose: () -> Void

    var body: some View {
        ContentUnavailableView(
            "Couldn't convert this URL",
            systemImage: "exclamationmark.triangle.fill",
            description: message.map { Text($0) }
        ).sheetHeader(onClose: onClose)
    }
}

// MARK: - EqualizerBars

/// A small equalizer of bars in the app's tint that bounce to one beat.
///
/// Each bar bounces once or twice per beat and starts at its own point in
/// it, so the bars move apart but stay in time. With Reduce Motion the bars
/// stand still at different heights.
private struct EqualizerBars: View {
    /// One beat in seconds, which is 120 beats per minute.
    private static let beatSeconds = 0.5
    /// How many times each bar bounces per beat.
    private static let bouncesPerBeat: [Double] = [1, 2, 1, 2, 1]
    /// Where in the beat each bar starts, as a fraction of it.
    private static let beatOffsets: [Double] = [0, 0.25, 0.5, 0.75, 0.25]
    /// The bars' heights with Reduce Motion, as a fraction of the full height.
    private static let restingLevels: [Double] = [0.45, 0.8, 0.6, 0.9, 0.5]
    /// The lowest a bar gets, as a fraction of the full height, so none vanishes.
    private static let minimumLevel = 0.2
    private static let barWidth: CGFloat = 8
    private static let barSpacing: CGFloat = 6
    private static let fullHeight: CGFloat = 44
    private static let framesPerSecond = 30.0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / Self.framesPerSecond, paused: reduceMotion)) { timeline in
            HStack(alignment: .bottom, spacing: Self.barSpacing) {
                ForEach(Self.restingLevels.indices, id: \.self) { index in
                    Capsule().fill(.tint).frame(width: Self.barWidth, height: Self.fullHeight * level(of: index, at: timeline.date))
                }
            }.frame(height: Self.fullHeight, alignment: .bottom)
        }.accessibilityHidden(true)
    }

    /// The height of bar `index` at `date`, as a fraction of the full height.
    private func level(of index: Int, at date: Date) -> Double {
        guard !reduceMotion
        else {
            return Self.restingLevels[index]
        }
        let beats = date.timeIntervalSinceReferenceDate / Self.beatSeconds
        let bounce = abs(sin(.pi * (beats * Self.bouncesPerBeat[index] + Self.beatOffsets[index])))
        return Self.minimumLevel + (1 - Self.minimumLevel) * bounce
    }
}

#endif
