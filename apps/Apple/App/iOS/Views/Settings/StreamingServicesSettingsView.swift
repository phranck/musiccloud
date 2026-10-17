#if os(iOS)
//
//  StreamingServicesSettingsView.swift
//  musiccloud
//

import SwiftUI

// MARK: - StreamingServicesSettingsView

/// The Streaming Services screen of the iOS Settings: a toggle per
/// supported service, listed alphabetically.
///
/// A disabled service is ignored by ``StreamingServices/isStreamingURL(_:defaults:)``,
/// so it is not detected on the clipboard, through the paste button, a
/// shared link or a shortcut.
struct StreamingServicesSettingsView: View {
    @State private var disabledIDs = Set(StreamingServices.all.filter { !StreamingServices.isEnabled($0) }.map(\.id))

    var body: some View {
        Form {
            Section {
                ForEach(StreamingServices.allSortedByDisplayName) { service in
                    Toggle(service.displayName, isOn: binding(for: service))
                }
            } header: {
                Text("A service that is off is ignored when a URL is detected.")
            }
        }
        .navigationTitle(String(localized: "Streaming Services"))
    }

}

private extension StreamingServicesSettingsView {
    /// Connects the visible toggle to the shared service choice without delaying UI feedback.
    /// - Parameter service: The stable service represented by this row.
    /// - Returns: A binding that updates the local selection and persists the same value.
    func binding(for service: StreamingServices.Service) -> Binding<Bool> {
        Binding(
            get: { !disabledIDs.contains(service.id) },
            set: { isEnabled in
                if isEnabled {
                    disabledIDs.remove(service.id)
                } else {
                    disabledIDs.insert(service.id)
                }
                StreamingServices.setEnabled(isEnabled, for: service)
            }
        )
    }
}

#Preview {
    NavigationStack {
        StreamingServicesSettingsView()
    }
}

#endif
