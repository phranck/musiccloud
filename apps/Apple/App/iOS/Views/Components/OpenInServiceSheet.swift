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
                    if let url = URL(string: link.url) {
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
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }
}

#endif
