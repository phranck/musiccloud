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

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .sound1:  "Sound 1"
        case .sound2:  "Sound 2"
        case .sound3:  "Sound 3"
        case .sound4:  "Sound 4"
        case .sound5:  "Sound 5"
        case .sound6:  "Sound 6"
        case .sound7:  "Sound 7"
        case .sound8:  "Sound 8"
        case .sound9:  "Sound 9"
        case .sound10: "Sound 10"
        case .sound11: "Sound 11"
        }
    }

    static let `default`: NotificationSound = .sound6

    /// Plays this sound once.
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
        sound.play()
        #else
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.play()
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
    static func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error {
                AppLogger.ui.error("Notification permission error: \(error.localizedDescription)")
            }
            AppLogger.ui.debug("Notification permission granted: \(granted)")
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
            content.body = info.genresString ?? "Artist"
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

        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                AppLogger.ui.error("Notification failed: \(error.localizedDescription)")
                return
            }
            playSound()
        }
    }
}

// MARK: - Private API

private extension NotificationManager {
    static func playSound() {
        guard UserDefaults.standard.object(forKey: "playNotificationSound") as? Bool ?? true else { return }
        let rawValue = UserDefaults.standard.string(forKey: "notificationSound") ?? NotificationSound.default.rawValue
        let sound = NotificationSound(rawValue: rawValue) ?? .default
        sound.play()
    }

    /// Creates a notification attachment from image data.
    static func createAttachment(from data: Data, id: String) -> UNNotificationAttachment? {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("\(id).jpg")

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
