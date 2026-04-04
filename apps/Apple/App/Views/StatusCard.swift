//
//  StatusCard.swift
//  musiccloud
//
//  Created by Frank Gregor on 04.04.26.
//

import SwiftUI

/// A card view that displays the current status of the clipboard monitor.
///
/// `StatusCard` adapts its appearance based on the monitor's status, showing
/// different icons, messages, and actions for idle, processing, success, and error states.
///
/// ## Status States
///
/// - **Idle**: Music note icon with instructions to copy a URL
/// - **Processing**: Progress spinner with the URL being processed
/// - **Success**: Green checkmark with the short URL and share button
/// - **Error**: Orange warning triangle with error message
///
/// ## Usage
///
/// ```swift
/// StatusCard(monitor: clipboardMonitor)
/// ```
///
/// The view automatically updates when the monitor's status changes thanks
/// to the `@Observable` macro on ``ClipboardMonitor``.
///
/// ## Topics
///
/// ### Initialization
/// - ``init(monitor:)``
///
/// ### Properties
/// - ``monitor``
struct StatusCard: View {
    /// The clipboard monitor to display status for
    var monitor: ClipboardMonitor

    var body: some View {
        VStack(spacing: 12) {
            switch monitor.status {
            case .idle:
                idleView
            case .processing(let url):
                processingView(url: url)
            case .success(let shortUrl):
                successView(shortUrl)
            case .error(let message):
                errorView(message)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: .rect(cornerRadius: 16))
    }
}

// MARK: - Status Views

private extension StatusCard {
    /// View displayed when processing a URL.
    ///
    /// Shows a progress spinner, "Resolving..." text, and the URL being processed
    /// (truncated in the middle if too long).
    ///
    /// - Parameter url: The URL currently being processed
    /// - Returns: A view showing the processing state
    func processingView(url: String) -> some View {
        Group {
            ProgressView().scaleEffect(1.4)
            Text("Resolving…").font(.subheadline).foregroundStyle(.secondary)
            Text(url)
                .font(.caption.monospaced())
                .foregroundStyle(.tertiary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }

    /// View displayed when an error occurs.
    ///
    /// Shows an orange warning triangle and the error message.
    ///
    /// - Parameter message: The error message to display
    /// - Returns: A view showing the error state
    func errorView(_ message: String) -> some View {
        Group {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 36))
                .foregroundStyle(.orange)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
    }

    /// View displayed after successful URL conversion.
    ///
    /// Shows a green checkmark, the short URL, and a share button.
    ///
    /// - Parameter shortUrl: The resulting musiccloud.io short URL
    /// - Returns: A view showing the success state
    func successView(_ shortUrl: String) -> some View {
        Group {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 36))
                .foregroundStyle(.green)
            Text(shortUrl)
                .font(.subheadline.monospaced())
            ShareLink(item: shortUrl) {
                Text("Share")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.tint, in: .rect(cornerRadius: 10))
                    .foregroundStyle(.white)
            }
        }
    }

    /// View displayed when idle (waiting for clipboard activity).
    ///
    /// Shows a music note icon and instructions for the user.
    var idleView: some View {
        Group {
            Image(systemName: "music.note.list")
                .font(.system(size: 36))
                .foregroundStyle(.tint)
            Text("Monitoring clipboard…")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("Copy a streaming URL to convert it automatically.")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.tertiary)
        }
    }
}
