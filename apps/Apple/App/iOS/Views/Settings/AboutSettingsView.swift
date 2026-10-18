#if os(iOS)
import SwiftUI

/// App identity and the project website, separate from editable preferences and destructive actions.
struct AboutSettingsView: View {
    var body: some View {
        Form {
            Section {
                LabeledContent("Version", value: Bundle.main.appVersion)
                Link(destination: MusicCloudAPI.productionURL) {
                    HStack {
                        Text("musiccloud.io")
                        Spacer()
                        Image(systemName: "arrow.up.right").imageScale(.small).foregroundStyle(.secondary)
                    }
                }
            }
        }.formStyle(.grouped)
    }
}
#endif
