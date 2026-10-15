#if os(macOS)
//
//  NightSkyBackground.swift
//  musiccloud
//

import SwiftUI

/// The sky of musiccloud.io as a view background: stars rotating around
/// Polaris behind drifting clouds in dark mode, the blue day sky with clouds
/// in light mode.
///
/// The drawing is `nightSkyColor` in `NightSky.metal`, a port of the website's
/// WebGL scene in `apps/frontend/src/components/background/nightSky/`. This
/// view supplies what the website's loop supplies there (`loop.ts`,
/// `BackgroundScene.tsx`): the animation time, the viewport size, the device
/// pixel ratio and the day amount.
///
/// The day amount follows the app's appearance, like the website's default
/// System mode follows `prefers-color-scheme` (`dayNightPolicy.ts`). The
/// animation runs at the website's frame cap and starts at time zero when the
/// view appears, as the website's does on page load. With Reduce Motion it
/// shows that first frame and stands still, which is what the website draws
/// for `prefers-reduced-motion`.
struct NightSkyBackground: View {
    /// The website's idle frame rate, `fpsCap` in its shader tokens. The sky
    /// moves slowly enough that more frames would only cost energy.
    private static let framesPerSecond: Double = 8

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.displayScale) private var displayScale

    /// The moment the animation time counts from.
    @State private var startDate = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / Self.framesPerSecond, paused: reduceMotion)) { timeline in
            let time = reduceMotion ? 0 : timeline.date.timeIntervalSince(startDate)
            GeometryReader { proxy in
                Rectangle()
                    .colorEffect(ShaderLibrary.nightSkyColor(
                        .float2(proxy.size),
                        .float(time),
                        .float(dayness),
                        .float(displayScale)
                    ))
            }
        }
        .accessibilityHidden(true)
    }

    /// 0 shows the night sky, 1 the day sky. Dark mode is night, as in the
    /// website's System mode.
    private var dayness: Float {
        colorScheme == .dark ? 0 : 1
    }
}

#Preview("Night") {
    NightSkyBackground()
        .frame(width: 400, height: 440)
        .environment(\.colorScheme, .dark)
}

#Preview("Day") {
    NightSkyBackground()
        .frame(width: 400, height: 440)
        .environment(\.colorScheme, .light)
}

#endif
