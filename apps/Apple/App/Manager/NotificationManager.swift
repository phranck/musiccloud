//
//  NotificationManager.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import AppKit
import UserNotifications

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
    /// Plays the custom notification sound via NSSound.
    static func playSound() {
        guard UserDefaults.standard.object(forKey: "playNotificationSound") as? Bool ?? true else { return }
        guard let sound = NSSound(named: "universfield-notification") ?? {
            guard let url = Bundle.main.url(
                forResource: "universfield-notification",
                withExtension: "caf"
            ) else { return nil }
            return NSSound(contentsOf: url, byReference: true)
        }() else {
            AppLogger.ui.error("Notification sound not found")
            return
        }
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
