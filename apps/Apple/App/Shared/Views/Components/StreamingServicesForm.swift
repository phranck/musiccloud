import SwiftUI

// MARK: - StreamingServicesForm

/// Shared native Settings form for individual services and the aggregate switch.
/// Brand marks share one scalable frame and use the shared brand palette; names provide accessibility labels.
struct StreamingServicesForm: View {
    @State private var enabledIDs = Set(StreamingServices.all.filter { StreamingServices.isEnabled($0) }.map(\.id))

    var body: some View {
        Form {
            Section {
                Toggle(isOn: allServicesBinding) {
                    VStack(alignment: .leading) {
                        Text("All Streaming Services")
                        if !enabledIDs.isEmpty && enabledIDs.count < StreamingServices.all.count {
                            Text("Some services enabled").foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section {
                ForEach(StreamingServices.allSortedByDisplayName) { service in
                    Toggle(isOn: binding(for: service)) {
                        Label {
                            Text(service.displayName)
                        } icon: {
                            StreamingServiceBrandIcon(service: service)
                        }
                    }
                }
            } header: {
                Text("A service that is off is ignored when a URL is detected.")
            }
        }.formStyle(.grouped)
    }
}

private extension StreamingServicesForm {
    /// Maps the aggregate switch to one persisted operation and immediate row updates.
    var allServicesBinding: Binding<Bool> {
        Binding(
            get: { enabledIDs.count == StreamingServices.all.count },
            set: { isEnabled in
                enabledIDs = isEnabled ? Set(StreamingServices.all.map(\.id)) : []
                StreamingServices.setAllEnabled(isEnabled)
            }
        )
    }

    /// Maps an individual row to the same shared preference domain as the aggregate switch.
    /// - Parameter service: The stable service represented by the row.
    /// - Returns: A binding whose updates also refresh the aggregate selection.
    func binding(for service: StreamingServices.Service) -> Binding<Bool> {
        Binding(
            get: { enabledIDs.contains(service.id) },
            set: { isEnabled in
                if isEnabled { enabledIDs.insert(service.id) } else { enabledIDs.remove(service.id) }
                StreamingServices.setEnabled(isEnabled, for: service)
            }
        )
    }
}

// MARK: - StreamingServiceBrandIcon

/// Fits a bundled brand mark into the same optical frame without changing its aspect ratio.
private struct StreamingServiceBrandIcon: View {
    let service: StreamingServices.Service
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 20

    var body: some View {
        Image(service.iconAssetName).resizable().renderingMode(.template).scaledToFit().frame(width: iconSize, height: iconSize)
            .foregroundStyle(service.brandingID == "tidal" ? Color.primary : Color(service.brandColorAssetName)).accessibilityHidden(true)
    }
}
