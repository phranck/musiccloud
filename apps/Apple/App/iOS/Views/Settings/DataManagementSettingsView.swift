#if os(iOS)
import SwiftUI

/// Isolates destructive history controls while reusing their existing local/iCloud confirmation boundary.
struct DataManagementSettingsView: View { var body: some View { Form { DangerZoneSection() }.formStyle(.grouped) } }
#endif
