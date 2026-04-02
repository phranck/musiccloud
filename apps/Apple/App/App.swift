import SwiftUI

@main
struct MusicCloudApp: App {
  @State private var historyManager = HistoryManager()
  @State private var monitor: ClipboardMonitor
  
  init() {
    let history = HistoryManager()
    _historyManager = State(initialValue: history)
    _monitor = State(initialValue: ClipboardMonitor(historyManager: history))
  }

  var body: some Scene {
    #if os(macOS)
    MenuBarExtra {
      MenuBarView()
        .environment(historyManager)
        .environment(monitor)
    } label: {
      Label("musiccloud", systemImage: "music.note.list")
    }
    .menuBarExtraStyle(.window)
    #else
    WindowGroup {
      ContentView()
        .environment(historyManager)
        .environment(monitor)
    }
    #endif
  }
}
