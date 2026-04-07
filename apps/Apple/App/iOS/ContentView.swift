#if os(iOS)
import SwiftUI

// MARK: - ContentView

/// Root view for the iOS app with tab-based navigation.
struct ContentView: View {
    var body: some View {
        TabView {
            NavigationStack {
                HomeView()
            }
            .tabItem {
                Label("Home", systemImage: "house")
            }
            NavigationStack {
                HistoryView()
            }
            .tabItem {
                Label("History", systemImage: "clock")
            }
            NavigationStack {
                SettingsView()
            }
            .tabItem {
                Label("Settings", systemImage: "gear")
            }
        }
    }
}

#endif
