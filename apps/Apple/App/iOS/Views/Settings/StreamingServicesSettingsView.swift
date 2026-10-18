#if os(iOS)
import SwiftUI

/// Hosts the shared streaming-service controls in iOS Settings.
struct StreamingServicesSettingsView: View {
    var body: some View { StreamingServicesForm().navigationTitle(String(localized: "Streaming Services")) }
}
#endif
