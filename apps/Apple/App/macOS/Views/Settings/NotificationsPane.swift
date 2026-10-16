#if os(macOS)
//
//  NotificationsPane.swift
//  musiccloud
//

import SwiftUI

// MARK: - NotificationsPane

/// The Notifications pane of the Settings window: whether a sound plays
/// after a conversion, and which one.
///
/// ``NotificationManager`` reads both settings when a conversion finishes.
struct NotificationsPane: View {
    @AppStorage(DefaultsKey.playNotificationSound, store: DefaultsKey.shared) private var playNotificationSound = true
    @AppStorage(DefaultsKey.notificationSound, store: DefaultsKey.shared) private var notificationSound = NotificationSound.default.rawValue

    var body: some View {
        Form {
            Section {
                Toggle(String(localized: "Play Notification Sound"), isOn: $playNotificationSound)
                if playNotificationSound {
                    NotificationSoundPicker(selectedSound: $notificationSound)
                }
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - NotificationSoundPicker

private struct NotificationSoundPicker: View {
    @Binding var selectedSound: String

    var body: some View {
        HStack {
            Picker(String(localized: "Sound"), selection: $selectedSound) {
                ForEach(NotificationSound.allCases) { sound in
                    Text(sound.displayName).tag(sound.rawValue)
                }
            }

            Button {
                let sound = NotificationSound(rawValue: selectedSound) ?? .default
                sound.play()
            } label: {
                Image(systemName: "play.fill")
            }
        }
    }
}

#endif
