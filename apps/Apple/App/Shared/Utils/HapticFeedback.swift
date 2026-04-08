#if os(iOS)
//
//  HapticFeedback.swift
//  musiccloud
//
//  Created by Frank Gregor on 08.04.26.
//

import UIKit

/// Provides pre-initialized haptic feedback generators to avoid instantiation latency.
enum HapticFeedback {
    private static let notificationGenerator: UINotificationFeedbackGenerator = {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        return generator
    }()

    static func success() {
        notificationGenerator.prepare()
        notificationGenerator.notificationOccurred(.success)
    }
}

#endif
