//
//  SettingsView.swift
//  musiccloud
//
//  Created by Frank Gregor on 05.04.26.
//

import ServiceManagement
import SwiftUI

// MARK: - SettingsView

struct SettingsView: View {
    @State private var tab: SettingsTab = .settings

    var body: some View {
        NavigationStack {
            Group {
                switch tab {
                case .settings: GeneralSettingsView()
                case .about: AboutView()
                }
            }
            .background(WindowKeyMonitor())
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Picker("", selection: $tab) {
                        ForEach(SettingsTab.allCases, id: \.self) { item in
                            Label(item.title, systemImage: item.icon)
                                .tag(item)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelStyle(.titleAndIcon)
                }
            }
        }
        .frame(minWidth: 640, maxWidth: .infinity, minHeight: 400, maxHeight: .infinity)
    }
}

// MARK: - Settings Tabs

private enum SettingsTab: String, CaseIterable {
    case settings
    case about

    var title: String {
        switch self {
        case .settings: String(localized: "Settings")
        case .about:    String(localized: "About")
        }
    }

    var icon: String {
        switch self {
        case .settings: "gearshape"
        case .about:    "info.circle"
        }
    }
}

// MARK: - GeneralSettingsView

private struct GeneralSettingsView: View {
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled
    @AppStorage("playNotificationSound") private var playNotificationSound = true
    @AppStorage("notificationSound") private var notificationSound = NotificationSound.default.rawValue

    var body: some View {
        Form {
            Toggle(String(localized: "Launch at Login"), isOn: $launchAtLogin)
                .onChange(of: launchAtLogin) {
                    do {
                        if launchAtLogin {
                            try SMAppService.mainApp.register()
                        } else {
                            try SMAppService.mainApp.unregister()
                        }
                    } catch {
                        AppLogger.ui.error("Launch at login failed: \(error.localizedDescription)")
                        launchAtLogin = SMAppService.mainApp.status == .enabled
                    }
                }

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
