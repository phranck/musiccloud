import SwiftUI

// MARK: - DangerZoneSection

/// Settings section that allows deleting all local and iCloud data.
struct DangerZoneSection: View {
    @Environment(HistoryManager.self) private var historyManager
    @State private var showConfirmation = false

    var body: some View {
        Section("Danger Zone") {
            Button(role: .destructive) {
                showConfirmation = true
            } label: {
                Label("Delete All Data", systemImage: "trash")
                    .foregroundStyle(.red)
            }
        }
        .confirmationDialog(
            "Delete All Data?",
            isPresented: $showConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete All", role: .destructive) {
                historyManager.clear()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently delete all conversion history from this device and iCloud. This cannot be undone.")
        }
    }
}
