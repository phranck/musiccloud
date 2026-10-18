#if os(iOS)
import SwiftUI

/// A grouped navigation overview; each destination owns its controls and transient state.
struct SettingsView: View {
    var body: some View {
        Form {
            ForEach(IOSSettingsGroup.allCases) { group in
                Section(group.title) {
                    ForEach(group.destinations(diagnosticsEnabled: BuildChannel.diagnosticsEnabled)) { destination in
                        NavigationLink(value: destination) { Label(destination.title, systemImage: destination.symbol) }
                    }
                }
            }
        }.navigationTitle("Settings").navigationDestination(for: IOSSettingsDestination.self) { destination in
            IOSSettingsDestinationView(destination: destination)
        }
    }
}

/// Keeps destination construction in one place without instantiating unrelated settings screens.
private struct IOSSettingsDestinationView: View {
    let destination: IOSSettingsDestination

    var body: some View {
        Group {
            switch destination {
            case .general: GeneralSettingsView()
            case .streamingServices: StreamingServicesSettingsView()
            case .socialMedia: SocialMediaSettingsView()
            case .diagnostics: DiagnosticsSettingsView()
            case .about: AboutSettingsView()
            case .dataManagement: DataManagementSettingsView()
            }
        }.navigationTitle(destination.title).navigationBarTitleDisplayMode(.inline)
    }
}
#endif
