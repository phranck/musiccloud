//
//  NotificationManager.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import AppKit
import UserNotifications

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

    /// Sends a notification for a successful URL conversion.
    ///
    /// Shows title, artist/subtitle, and artwork matching the history row display.
    ///
    /// - Parameter entry: The successfully converted media info
    static func notifySuccess(entry: MediaInfo) {
        let content = UNMutableNotificationContent()
        content.sound = .none

        switch entry.contentType {
        case .track(let info):
            content.title = info.title
            content.body = info.artistsString
        case .album(let info):
            content.title = info.name
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

    /// Plays the custom notification sound via NSSound.
    private static func playSound() {
        guard let sound = NSSound(named: "universfield-notification") ?? {
            guard let url = Bundle.main.url(forResource: "universfield-notification", withExtension: "caf") else { return nil }
            return NSSound(contentsOf: url, byReference: true)
        }() else {
            AppLogger.ui.error("Notification sound not found")
            return
        }
        sound.play()
    }

    /// Creates a notification attachment from image data.
    private static func createAttachment(from data: Data, id: String) -> UNNotificationAttachment? {
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("\(id).jpg")

        do {
            try data.write(to: fileURL)
            let attachment = try UNNotificationAttachment(identifier: id, url: fileURL)
            return attachment
        } catch {
            AppLogger.ui.error("Notification attachment failed: \(error.localizedDescription)")
            return nil
        }
    }
}
