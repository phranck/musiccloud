#if os(iOS)
import SwiftUI

// MARK: - OpenInServiceSheet

/// Bottom sheet listing all available service links for a conversion.
struct OpenInServiceSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var links: [ServiceLink]

    var body: some View {
        NavigationStack {
            List(links, id: \.service) { link in
                Button {
                    if let url = StreamingServices.webURL(link.url) {
                        openURL(url)
                    }
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "music.note")
                            .frame(width: 28, height: 28)
                            .foregroundStyle(.tint)
                        Text(link.displayName)
                            .foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Open In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // The close role exists from iOS 26 on; before, the same mark is drawn by hand.
                    if #available(iOS 26, *) {
                        Button(role: .close) { dismiss() }
                    } else {
                        Button { dismiss() } label: {
                            Image(systemName: "xmark")
                        }
                        .accessibilityLabel(String(localized: "Close"))
                    }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#endif
