//
//  NotificationManager.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

#if os(macOS)
import AppKit
#endif
import AVFoundation
import UserNotifications

// MARK: - NotificationSound

enum NotificationSound: String, CaseIterable, Identifiable {
    case sound1, sound2, sound3, sound4, sound5, sound6
    case sound7, sound8, sound9, sound10, sound11

    /// The sound that is playing. Held so it is not released halfway
    /// through, and only touched on the main actor.
    #if os(macOS)
    @MainActor private static var currentSound: NSSound?
    #else
    @MainActor private static var audioPlayer: AVAudioPlayer?
    #endif

    var id: String { rawValue }

    /// The name shown in Settings. Each name describes how the sound goes,
    /// such as a rising arpeggio or a single click. The raw values stay
    /// `sound1` to `sound11`, because they are the stored preference and
    /// the file names.
    var displayName: String {
        switch self {
        case .sound1:  String(localized: "Bell", comment: "Notification sound: a single high, softly struck tone")
        case .sound2:  String(localized: "Dip", comment: "Notification sound: two quick notes stepping down")
        case .sound3:  String(localized: "Ascend", comment: "Notification sound: three notes rising to the octave")
        case .sound4:  String(localized: "Lift", comment: "Notification sound: two soft notes rising a fifth")
        case .sound5:  String(localized: "Glide", comment: "Notification sound: a warm tone sliding upward")
        case .sound6:  String(localized: "Sparkle", comment: "Notification sound: a bright jump up an octave")
        case .sound7:  String(localized: "Blip", comment: "Notification sound: a very short, bright step down")
        case .sound8:  String(localized: "Tap", comment: "Notification sound: a single short click")
        case .sound9:  String(localized: "Fanfare", comment: "Notification sound: a rising major chord, the longest sound")
        case .sound10: String(localized: "Ping", comment: "Notification sound: a short leap up an octave")
        case .sound11: String(localized: "Mellow", comment: "Notification sound: a single warm, round tone")
        }
    }

    static let `default`: NotificationSound = .sound6

    /// Plays this sound once.
    @MainActor
    func play() {
        guard let url = Bundle.main.url(
            forResource: rawValue,
            withExtension: "mp3"
        ) else {
            AppLogger.ui.error("Notification sound file not found: \(rawValue)")
            return
        }
        #if os(macOS)
        guard let sound = NSSound(contentsOf: url, byReference: true) else {
            AppLogger.ui.error("Failed to load notification sound: \(rawValue)")
            return
        }
        Self.currentSound = sound
        sound.play()
        #else
        do {
            Self.audioPlayer = try AVAudioPlayer(contentsOf: url)
            Self.audioPlayer?.play()
        } catch {
            AppLogger.ui.error("Failed to play notification sound: \(error.localizedDescription)")
        }
        #endif
    }
}

// MARK: - Public API

/// Handles local notifications for successful URL conversions.
enum NotificationManager {
    /// Requests notification permission on first use.
    ///
    /// Returns once the user has answered the system's dialog, or at once
    /// when they answered it before.
    static func requestPermission() async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            AppLogger.ui.debug("Notification permission granted: \(granted)")
        } catch {
            AppLogger.ui.error("Notification permission error: \(error.localizedDescription)")
            AppLogger.ui.debug("Notification permission granted: false")
        }
    }

    /// Removes leftover notification attachment files from previous sessions.
    static func cleanupAttachmentCache() {
        let tempDir = FileManager.default.temporaryDirectory
        let enumerator = FileManager.default.enumerator(
            at: tempDir,
            includingPropertiesForKeys: nil,
            options: [.skipsSubdirectoryDescendants]
        )
        while let fileURL = enumerator?.nextObject() as? URL {
            guard fileURL.pathExtension == "jpg",
                  UUID(uuidString: fileURL.deletingPathExtension().lastPathComponent) != nil else { continue }
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    /// Sends a notification for a successful URL conversion.
    ///
    /// Shows title, artist/subtitle, and artwork matching the history row display.
    /// Returns at once, so the caller goes on while the notification center
    /// takes the request. The sound plays once the center has accepted it.
    ///
    /// - Parameter entry: The successfully converted media info
    static func notifySuccess(entry: MediaEntry) {
        let content = UNMutableNotificationContent()
        content.sound = .none

        switch entry.contentType {
        case .track(let info):
            content.title = info.title
            content.body = info.artistsString
        case .album(let info):
            content.title = info.title
            content.body = info.artistsString
        case .artist(let info):
            content.title = info.name
            content.body = info.genresString ?? String(localized: "Artist")
        }

        // Attach artwork if available
        if let imageData = entry.artworkImageData,
           let attachment = createAttachment(from: imageData, id: entry.id.uuidString) {
            content.attachments = [attachment]
        }

        let request = UNNotificationRequest(
            identifier: entry.id.uuidString,
            content: content,
            trigger: nil
        )

        // The sound is played on the main actor, so the task runs there.
        Task { @MainActor in
            do {
                try await UNUserNotificationCenter.current().add(request)
                playSound()
            } catch {
                AppLogger.ui.error("Notification failed: \(error.localizedDescription)")
            }
        }
    }
}

extension NotificationManager {
    /// Sends a notification with only a title and a body, silent, as automatic posting reports.
    ///
    /// Returns once the notification center has accepted or refused the request.
    ///
    /// - Parameter identifier: A notification with the same identifier replaces this one.
    static func notify(title: String, body: String, identifier: String) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .none
        do {
            try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
        } catch {
            AppLogger.ui.error("Notification failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Private API

private extension NotificationManager {
    @MainActor
    static func playSound() {
        guard UserDefaults.standard.object(forKey: DefaultsKey.playNotificationSound) as? Bool ?? true else { return }
        let rawValue = UserDefaults.standard.string(forKey: DefaultsKey.notificationSound) ?? NotificationSound.default.rawValue
        let sound = NotificationSound(rawValue: rawValue) ?? .default
        sound.play()
    }

    /// Creates a notification attachment from image data.
    static func createAttachment(from data: Data, id: String) -> UNNotificationAttachment? {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appending(path: "\(id).jpg")

        do {
            try data.write(to: fileURL, options: .atomic)
            let attachment = try UNNotificationAttachment(identifier: id, url: fileURL)
            return attachment
        } catch {
            AppLogger.ui.error("Notification attachment failed: \(error.localizedDescription)")
            try? FileManager.default.removeItem(at: fileURL)
            return nil
        }
    }
}
