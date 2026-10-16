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
/// pixel ratio, the day amount and the design-token values in ``tokens``.
///
/// The day amount follows the app's appearance, like the website's default
/// System mode follows `prefers-color-scheme` (`dayNightPolicy.ts`). The
/// animation runs at the tokens' frame cap and starts at time zero when the
/// view appears, as the website's does on page load. With Reduce Motion it
/// shows that first frame and stands still, which is what the website draws
/// for `prefers-reduced-motion`.
struct NightSkyBackground: View {
    /// The values the sky is drawn with.
    var tokens = SkyTokens()

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.displayScale) private var displayScale

    /// The moment the animation time counts from.
    @State private var startDate = Date()

    var body: some View {
        // Built outside the timeline, so the colors are not converted on every frame.
        let values = tokens.shaderValues
        TimelineView(.animation(minimumInterval: 1 / Double(tokens.fpsCap), paused: reduceMotion)) { timeline in
            let time = reduceMotion ? 0 : timeline.date.timeIntervalSince(startDate)
            GeometryReader { proxy in
                Rectangle()
                    .colorEffect(ShaderLibrary.nightSkyColor(
                        .float2(proxy.size),
                        .float(time),
                        .float(dayness),
                        .float(displayScale),
                        .floatArray(values)
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
