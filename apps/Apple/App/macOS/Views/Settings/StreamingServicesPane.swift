#if os(macOS)
import SwiftUI

/// Hosts the shared streaming-service controls in macOS Settings.
struct StreamingServicesPane: View { var body: some View { StreamingServicesForm() } }
#endif
